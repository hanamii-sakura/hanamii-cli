import type { HanamiiClient } from '../api/client.js'
import type { StorageBucket } from '../api/types.js'
import { WorkspaceAmbiguousError } from './workspace.js'

/** ストレージ API はパスにワークスペース ID が要るため、省略時も必ず 1 つに決める。 */
export async function requireWorkspace(
  client: HanamiiClient,
  workspaceId?: string,
): Promise<string> {
  if (workspaceId) return workspaceId
  const { token } = await client.getCurrentToken()
  if (token.scopeType === 'workspace' && token.scopeWorkspaceId) return token.scopeWorkspaceId
  const { workspaces } = await client.listWorkspaces()
  if (workspaces.length > 1) throw new WorkspaceAmbiguousError(workspaces)
  if (!workspaces[0]) throw new Error('利用できるワークスペースがありません')
  return workspaces[0].id
}

export async function listAllBuckets(
  client: HanamiiClient,
  workspaceId: string,
): Promise<{ buckets: StorageBucket[]; apiOrigin: string }> {
  const buckets: StorageBucket[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await client.listStorageBuckets(workspaceId, cursor)
    buckets.push(...page.items)
    if (!page.nextCursor) return { buckets, apiOrigin: page.apiOrigin }
    if (seen.has(page.nextCursor)) throw new Error('バケット一覧のカーソルが循環しています')
    seen.add(page.nextCursor)
    cursor = page.nextCursor
  }
}

/** バケットは ID でも名前でも指定できる。ID の一致を優先する。 */
export async function resolveBucket(
  client: HanamiiClient,
  workspaceId: string,
  bucket: string,
): Promise<{ bucket: StorageBucket; apiOrigin: string }> {
  const { buckets, apiOrigin } = await listAllBuckets(client, workspaceId)
  const found =
    buckets.find((item) => item.id === bucket) ?? buckets.find((item) => item.name === bucket)
  if (!found) throw new Error('バケットが見つかりません')
  return { bucket: found, apiOrigin }
}
