import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { redact } from '../api/errors.js'

export function registerResources(server: McpServer, fetcher: typeof fetch = globalThis.fetch) {
  let cached: Promise<string> | undefined
  server.registerResource(
    'public-api',
    'hanamii://docs/public-api',
    {
      description: 'hanamii 公開 REST API ドキュメント',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      if (!cached) {
        cached = (async () => {
          const response = await fetcher('https://hanamii.jp/docs/public-api.md', {
            signal: AbortSignal.timeout(60_000),
          })
          if (!response.ok) throw new Error('ドキュメントの取得に失敗しました')
          return redact(await response.text())
        })()
      }
      let text: string
      try {
        text = await cached
      } catch {
        cached = undefined
        text = '公開 API ドキュメントを取得できませんでした。時間をおいて再試行してください。'
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }
    },
  )
}
