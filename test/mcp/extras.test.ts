import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { connect } from './helpers.js'
import { main } from '../../src/cli.js'
const api = setupServer()
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  api.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => api.close())
it('公開docsをfetchし、同時・連続読取はメモリキャッシュを使う', async () => {
  const fetchDocs = vi.fn(({ request }: { request: Request }) => {
    expect(request.headers.has('authorization')).toBe(false)
    return HttpResponse.text('# API\n説明')
  })
  api.use(http.get('https://hanamii.jp/docs/public-api.md', fetchDocs))
  const s = await connect({ env: {} })
  try {
    expect((await s.client.listResources()).resources).toEqual([
      expect.objectContaining({ uri: 'hanamii://docs/public-api', mimeType: 'text/markdown' }),
    ])
    const reads = await Promise.all([
      s.client.readResource({ uri: 'hanamii://docs/public-api' }),
      s.client.readResource({ uri: 'hanamii://docs/public-api' }),
    ])
    expect(reads[0]?.contents[0]).toMatchObject({ text: '# API\n説明' })
    await s.client.readResource({ uri: 'hanamii://docs/public-api' })
    expect(fetchDocs).toHaveBeenCalledTimes(1)
  } finally {
    await s.close()
  }
})
it('docs取得失敗は本文で返し、次回は再試行', async () => {
  api.use(
    http.get(
      'https://hanamii.jp/docs/public-api.md',
      () => new HttpResponse('hnm_secret', { status: 503 }),
    ),
  )
  const s = await connect()
  try {
    const result = await s.client.readResource({ uri: 'hanamii://docs/public-api' })
    expect(result).not.toHaveProperty('isError')
    expect(result.contents[0]).toMatchObject({
      text: expect.stringContaining('取得できませんでした'),
    })
    expect(JSON.stringify(result)).not.toContain('hnm_')
    api.use(http.get('https://hanamii.jp/docs/public-api.md', () => HttpResponse.text('recovered')))
    expect(
      (await s.client.readResource({ uri: 'hanamii://docs/public-api' })).contents[0],
    ).toMatchObject({ text: 'recovered' })
  } finally {
    await s.close()
  }
})
it('deploy_appの事前確認→デプロイ→失敗時ログの順序', async () => {
  const s = await connect({ env: {} })
  try {
    expect((await s.client.listPrompts()).prompts.map((p) => p.name)).toEqual(['deploy_app'])
    const result = await s.client.getPrompt({ name: 'deploy_app' })
    const content = result.messages[0]!.content
    expect(content.type).toBe('text')
    if (content.type !== 'text') throw new Error('text prompt expected')
    const text = content.text
    expect(text.indexOf('事前確認')).toBeLessThan(text.indexOf('deploy_project'))
    expect(text.indexOf('deploy_project')).toBeLessThan(text.indexOf('get_logs'))
    expect(text).toContain('失敗時')
  } finally {
    await s.close()
  }
})
it.each(['claude-code', 'cursor', 'codex', 'claude-desktop'])(
  '%sのスニペットを表示しトークンや設定を変更しない',
  async (client) => {
    let stdout = ''
    const run = vi.fn()
    const code = await main(['node', 'hanamii', 'mcp', 'install', '--client', client, '--json'], {
      env: { HANAMII_TOKEN: 'hnm_actual_secret' },
      stdout: (t) => {
        stdout += t
      },
      runMcpInstall: run,
    })
    expect(code).toBe(0)
    const result = JSON.parse(stdout)
    expect(result.client).toBe(client)
    expect(result.snippet).toContain('HANAMII_TOKEN')
    expect(result.snippet).toContain('npx')
    expect(result.snippet).toContain('"mcp"')
    expect(stdout).not.toContain('hnm_')
    if (client === 'codex') {
      expect(result.snippet).toContain('[mcp_servers.hanamii]')
      expect(result.snippet).toContain('env_vars = ["HANAMII_TOKEN"]')
    } else {
      const snippet = result.snippet as string
      const config = JSON.parse(snippet.slice(snippet.indexOf('{'), snippet.lastIndexOf('}') + 1))
      expect(config.mcpServers.hanamii).toEqual({
        command: 'npx',
        args: ['-y', 'hanamii', 'mcp'],
        env: { HANAMII_TOKEN: '<YOUR_HANAMII_TOKEN>' },
      })
    }
    expect(run).not.toHaveBeenCalled()
  },
)
it('--runはclaude-codeだけ。指定のコマンドと環境を渡し、失敗も伏字', async () => {
  let stderr = ''
  const run = vi.fn().mockResolvedValue(undefined)
  const deps = {
    env: { HANAMII_TOKEN: 'hnm_install_secret' },
    stdout: () => {},
    stderr: (t: string) => {
      stderr += t
    },
    runMcpInstall: run,
  }
  const args = ['node', 'hanamii', 'mcp', 'install', '--run', '--client']
  for (const client of ['cursor', 'codex', 'claude-desktop', 'unknown'])
    expect(await main([...args, client], deps)).toBe(2)
  expect(run).not.toHaveBeenCalled()
  expect(await main([...args, 'claude-code'], deps)).toBe(0)
  expect(run).toHaveBeenCalledWith(
    'claude',
    ['mcp', 'add', 'hanamii', '--', 'npx', '-y', 'hanamii', 'mcp'],
    expect.objectContaining({ HANAMII_TOKEN: 'hnm_install_secret' }),
  )
  run.mockRejectedValue(new Error('failed hnm_install_secret'))
  expect(await main([...args, 'claude-code'], deps)).toBe(1)
  expect(stderr).not.toContain('hnm_')
  expect(stderr).toContain('[REDACTED]')
})
