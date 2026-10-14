import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ProjectLink {
  projectId: string
  name: string
  workspaceId: string
}
const linkPath = (dir: string) => join(dir, '.hanamii', 'project.json')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** 実 API のプロジェクト ID は UUID。仕様書の例にある prj_ 接頭辞も受け付ける。 */
export function looksLikeProjectId(value: string): boolean {
  return UUID_PATTERN.test(value) || (value.startsWith('prj_') && value.length > 4)
}
function valid(value: unknown): value is ProjectLink {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ProjectLink>
  return (
    typeof v.projectId === 'string' &&
    looksLikeProjectId(v.projectId) &&
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
  // 他のファイルが無ければディレクトリも残さない（ENOTEMPTY や ENOENT は無視）
  await rmdir(join(dir, '.hanamii')).catch(() => undefined)
}
