import type { HanamiiClient } from '../api/client.js'
import type { Workspace } from '../api/types.js'

export class WorkspaceAmbiguousError extends Error {
  readonly exitCode = 6
  constructor(public readonly workspaces: Workspace[]) {
    super(
      `ワークスペースが複数あります。--workspace で指定してください:\n${workspaces.map((w) => `${w.id}\t${w.name}`).join('\n')}`,
    )
  }
}
export async function resolveWorkspace(
  client: HanamiiClient,
  workspaceId?: string,
): Promise<string | undefined> {
  if (workspaceId) return workspaceId
  const { token } = await client.getCurrentToken()
  if (token.scopeType === 'workspace') return undefined
  const { workspaces } = await client.listWorkspaces()
  if (workspaces.length > 1) throw new WorkspaceAmbiguousError(workspaces)
  return workspaces[0]?.id
}
