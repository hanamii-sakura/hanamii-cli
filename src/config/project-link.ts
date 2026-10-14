import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ProjectLink {
  projectId: string
  name: string
  workspaceId: string
}
const linkPath = (dir: string) => join(dir, '.hanamii', 'project.json')
function valid(value: unknown): value is ProjectLink {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ProjectLink>
  return (
    typeof v.projectId === 'string' &&
    v.projectId.startsWith('prj_') &&
    v.projectId.length > 4 &&
    typeof v.name === 'string' &&
    Boolean(v.name) &&
    typeof v.workspaceId === 'string' &&
    Boolean(v.workspaceId)
  )
}
export async function readProjectLink(dir: string): Promise<ProjectLink | undefined> {
  let text: string
  try {
    text = await readFile(linkPath(dir), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error('プロジェクトリンクを読み込めません')
  }
  try {
    const value: unknown = JSON.parse(text)
    if (!valid(value)) throw new Error()
    return { projectId: value.projectId, name: value.name, workspaceId: value.workspaceId }
  } catch {
    throw new Error('プロジェクトリンクの形式が不正です。hanamii link で設定し直してください')
  }
}
export async function writeProjectLink(dir: string, link: ProjectLink): Promise<void> {
  if (!valid(link)) throw new Error('プロジェクトリンクの形式が不正です')
  const path = linkPath(dir)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await mkdir(join(dir, '.hanamii'), { recursive: true, mode: 0o700 })
    await writeFile(
      temporary,
      `${JSON.stringify({ projectId: link.projectId, name: link.name, workspaceId: link.workspaceId }, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    )
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
export async function removeProjectLink(dir: string): Promise<void> {
  await rm(linkPath(dir), { force: true })
}
