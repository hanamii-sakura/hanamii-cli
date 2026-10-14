import type { CliContext, GlobalOptions } from './context.js'
import { resolveProject } from '../core/project-resolve.js'
import { OperationError } from '../core/errors.js'

export interface ProjectOptions extends GlobalOptions {
  project?: string
}
export async function projectContext(context: CliContext, options: ProjectOptions) {
  const { client } = await context.authenticated(options)
  const id = await resolveProject(client, {
    ...(options.project ? { project: options.project } : {}),
    ...(options.workspace ? { workspaceId: options.workspace } : {}),
    ...(context.deps.cwd ? { dir: context.deps.cwd } : {}),
  })
  if (options.workspace) {
    const { project } = await client.getProject(id)
    if (project.workspaceId !== options.workspace)
      throw new OperationError('プロジェクトと --workspace が一致しません', 2)
  }
  return { client, id }
}
export function integerOption(value: string, name: string, min: number, max: number): number {
  const n = Number(value)
  if (!value.trim() || !Number.isSafeInteger(n) || n < min || n > max)
    throw new OperationError(`${name} は ${min}〜${max} の整数で指定してください`, 2)
  return n
}
