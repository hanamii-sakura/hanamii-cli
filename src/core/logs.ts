import type { HanamiiClient, CallOptions } from '../api/client.js'
import type { Log, LogsQuery } from '../api/types.js'

export function fetchLogs(
  client: HanamiiClient,
  project: string,
  query: LogsQuery = {},
  call: CallOptions = {},
) {
  return client.getLogs(project, query, call)
}
function wait(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, 3000)
    signal?.addEventListener('abort', done, { once: true })
    if (signal?.aborted) done()
  })
}
/** stdout に書かず、取得した差分だけを通知する。中断時は正常終了する。 */
export async function followLogs(
  client: HanamiiClient,
  project: string,
  query: LogsQuery,
  options: { signal?: AbortSignal; onLogs: (logs: Log[]) => void },
): Promise<void> {
  let latest: Log | undefined
  let first = true
  try {
    while (!options.signal?.aborted) {
      const { logs } = await fetchLogs(
        client,
        project,
        first
          ? query
          : {
              ...(query.limit === undefined ? {} : { limit: query.limit }),
              ...(latest ? { since: latest.timestamp } : query.since ? { since: query.since } : {}),
            },
        options.signal ? { signal: options.signal } : {},
      )
      if (options.signal?.aborted) return
      const seen = new Set<string>()
      const fresh = logs
        .filter((log) => {
          const key = JSON.stringify([log.timestamp, log.message])
          if (
            (latest && Date.parse(log.timestamp) <= Date.parse(latest.timestamp)) ||
            seen.has(key)
          )
            return false
          seen.add(key)
          return true
        })
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      if (fresh.length) {
        latest = fresh[fresh.length - 1]!
        options.onLogs(fresh)
      }
      first = false
      await wait(options.signal)
    }
  } catch (error) {
    if (!options.signal?.aborted) throw error
  }
}
