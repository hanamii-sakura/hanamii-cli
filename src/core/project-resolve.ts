import type { HanamiiClient } from '../api/client.js'
import type { Project } from '../api/types.js'
import { readProjectLink } from '../config/project-link.js'

export interface ProjectOptions {
  project?: string
  dir?: string
  workspaceId?: string
}
/** 名前検索では全ページを確認し、同名があれば自動選択しない。 */
export async function listAllProjects(
  client: HanamiiClient,
  workspaceId?: string,
): Promise<Project[]> {
  const projects: Project[] = []
  const seen = new Set<number>()
  let until: number | undefined
  for (;;) {
    const page = await client.listProjects({
      limit: 100,
      ...(workspaceId ? { workspaceId } : {}),
      ...(until === undefined ? {} : { until }),
    })
    projects.push(...page.projects)
    if (page.pagination.next === null) return projects
    if (seen.has(page.pagination.next))
      throw new Error('プロジェクト一覧のカーソルが循環しています')
    until = page.pagination.next
    seen.add(until)
  }
}
export async function resolveProject(
  client: HanamiiClient,
  options: ProjectOptions = {},
): Promise<string> {
  if (options.project) {
    if (options.project.startsWith('prj_')) return options.project
    const matches = (await listAllProjects(client, options.workspaceId)).filter(
      (p) => p.name === options.project,
    )
    if (matches.length === 0) throw new Error('プロジェクトが見つかりません')
    if (matches.length > 1)
      throw new Error(
        '同名のプロジェクトが複数あります。--workspace または prj_ ID で指定してください',
      )
    return matches[0]!.id
  }
  const link = await readProjectLink(options.dir ?? process.cwd())
  if (!link)
    throw new Error('プロジェクトが未指定です。--project または hanamii link で指定してください')
  if (options.workspaceId && options.workspaceId !== link.workspaceId)
    throw new Error('リンク先と --workspace が一致しません')
  return link.projectId
}
