import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { buildProgram, main } from '../../src/cli.js'
import { browserCommand, type CliDependencies } from '../../src/cli/context.js'
import { configPath } from '../../src/config/paths.js'
import { readConfig, saveToken } from '../../src/config/store.js'
import { AuthError, NetworkError } from '../../src/api/errors.js'
import { exitCode } from '../../src/cli/output.js'

const baseUrl = 'https://api.example.test'
const secret = 'hnm_cli_secret'
const metadata = {
  id: 'tok_1',
  name: 'CLI',
  scopeType: 'workspace',
  scopeWorkspaceId: 'ws_1',
  createdAt: 100,
  lastUsedAt: 200,
  expiresAt: null,
}
const server = setupServer()
let home: string
let stdout: string
let stderr: string
let deps: CliDependencies
let openBrowser: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>
let promptToken: ReturnType<typeof vi.fn<() => Promise<string | undefined>>>
const run = (...args: string[]) => main(['node', 'hanamii', ...args], deps)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hanamii-cli-'))
  stdout = ''
  stderr = ''
  openBrowser = vi.fn().mockResolvedValue(undefined)
  promptToken = vi.fn().mockResolvedValue(secret)
  deps = {
    home,
    platform: 'linux',
    env: { HANAMII_BASE_URL: baseUrl },
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
    openBrowser,
    promptToken,
    isInteractive: true,
  }
  server.use(
    http.get(`${baseUrl}/api/v1/user/tokens/current`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`)
      return HttpResponse.json({ token: metadata, bearerToken: secret })
    }),
  )
})
afterEach(async () => {
  server.resetHandlers()
  await rm(home, { recursive: true, force: true })
})
afterAll(() => server.close())

describe('login / logout / whoami / workspaces list', () => {
  it('対話ログインはブラウザ→マスク入力→検証→保存し、トークンを出力しない', async () => {
    expect(await run('login', '--json')).toBe(0)
    expect(openBrowser).toHaveBeenCalledWith(`${baseUrl}/account/settings/tokens`)
    expect(openBrowser.mock.invocationCallOrder[0]).toBeLessThan(
      promptToken.mock.invocationCallOrder[0]!,
    )
    expect(JSON.parse(stdout)).toEqual({ loggedIn: true, baseUrl })
    expect((await readConfig(deps)).tokens[baseUrl]).toBe(secret)
    if (process.platform !== 'win32')
      expect((await stat(configPath(deps))).mode & 0o777).toBe(0o600)
    expect(stdout + stderr).not.toContain(secret)
  })
  it('--no-browser は起動しない。起動失敗時も URL 案内と入力を続ける', async () => {
    expect(await run('login', '--no-browser')).toBe(0)
    expect(openBrowser).not.toHaveBeenCalled()
    openBrowser.mockRejectedValue(new Error('failed'))
    expect(await run('login')).toBe(0)
    expect(stderr).toContain('ブラウザを起動できませんでした')
    expect(promptToken).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['--token', secret, 'login'],
    ['login', '--token', secret],
  ])('--token はルートとサブコマンドの両位置で対話を省略: %j', async (...args) => {
    deps.isInteractive = false
    expect(await run(...args)).toBe(0)
    expect(openBrowser).not.toHaveBeenCalled()
    expect(promptToken).not.toHaveBeenCalled()
    expect((await readConfig(deps)).tokens[baseUrl]).toBe(secret)
  })
  it('認証失敗は exit 3、保存済みトークンを変更せずエラーの秘密も伏せる', async () => {
    await saveToken(baseUrl, 'old', deps)
    server.use(
      http.get(`${baseUrl}/api/v1/user/tokens/current`, () =>
        HttpResponse.json(
          { error: { code: 'unauthorized', message: `invalid ${secret}` } },
          { status: 401 },
        ),
      ),
    )
    expect(await run('login', '--token', secret, '--json')).toBe(3)
    expect((await readConfig(deps)).tokens[baseUrl]).toBe('old')
    expect(JSON.parse(stderr)).toEqual({ error: { message: 'invalid [REDACTED]', exitCode: 3 } })
    expect(stdout).toBe('')
  })
  it('非対話・キャンセル・空入力では保存も検証もしない', async () => {
    deps.isInteractive = false
    expect(await run('login')).toBe(2)
    expect(openBrowser).not.toHaveBeenCalled()
    deps.isInteractive = true
    promptToken.mockResolvedValue(undefined)
    expect(await run('login', '--no-browser')).toBe(1)
    promptToken.mockResolvedValue('  ')
    expect(await run('login', '--no-browser')).toBe(3)
    expect((await readConfig(deps)).tokens).toEqual({})
  })
  it.each(['flag', 'env', 'config'] as const)(
    'whoami は %s の取得元と metadata だけ表示する',
    async (source) => {
      if (source === 'config') await saveToken(baseUrl, secret, deps)
      if (source === 'env') deps.env!.HANAMII_TOKEN = secret
      const args = source === 'flag' ? ['--token', secret] : []
      expect(await run('whoami', '--json', ...args)).toBe(0)
      expect(JSON.parse(stdout)).toEqual({
        name: 'CLI',
        scopeType: 'workspace',
        scopeWorkspaceId: 'ws_1',
        expiresAt: null,
        source,
      })
      expect(stdout + stderr).not.toContain(secret)
    },
  )
  it('whoami の human 出力と期限を表示する', async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/user/tokens/current`, () =>
        HttpResponse.json({ token: { ...metadata, expiresAt: 1800000000000 } }),
      ),
    )
    expect(await run('whoami', '--token', secret)).toBe(0)
    expect(stdout).toContain('スコープ: workspace (ws_1)')
    expect(stdout).toContain(new Date(1800000000000).toISOString())
    expect(stdout).toContain('取得元: flag')
  })
  it('whoami と workspaces list は未認証なら exit 3', async () => {
    expect(await run('whoami')).toBe(3)
    expect(await run('workspaces', 'list')).toBe(3)
    expect(stderr).toContain('hanamii login')
  })
  it('logout は現在の接続先だけ削除し、環境変数が残ることを表示する', async () => {
    await saveToken(baseUrl, secret, deps)
    await saveToken('https://other.example.test', 'other', deps)
    deps.env!.HANAMII_TOKEN = secret
    expect(await run('logout', '--json')).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ loggedOut: true, baseUrl, environmentTokenActive: true })
    expect((await readConfig(deps)).tokens).toEqual({ 'https://other.example.test': 'other' })
    expect(await run('logout')).toBe(0)
    expect(stdout).toContain('HANAMII_TOKEN は引き続き有効')
  })
  it('workspaces list は一覧・空一覧・JSON・共通オプションに対応する', async () => {
    const workspaces = [
      { id: 'ws_1', name: 'team', role: 'owner' },
      { id: 'ws_2', name: 'personal', role: 'viewer' },
    ]
    server.use(
      http.get(`${baseUrl}/api/v1/workspaces`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`)
        expect(new URL(request.url).search).toBe('')
        return HttpResponse.json({ workspaces })
      }),
    )
    expect(
      await run('--token', secret, 'workspaces', 'list', '--workspace', 'ws_1', '--json'),
    ).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ workspaces })
    stdout = ''
    expect(await run('workspaces', 'list', '--token', secret)).toBe(0)
    expect(stdout).toContain('ws_1\tteam\towner')
    server.use(
      http.get(`${baseUrl}/api/v1/workspaces`, () => HttpResponse.json({ workspaces: [] })),
    )
    expect(await run('workspaces', 'list', '--token', secret)).toBe(0)
    expect(stdout).toContain('ワークスペースはありません')
  })
  it('API からの表示文字列に秘密が含まれても伏せる', async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/user/tokens/current`, () =>
        HttpResponse.json({ token: { ...metadata, name: `name ${secret}` } }),
      ),
    )
    expect(await run('whoami', '--token', secret, '--json')).toBe(0)
    expect(JSON.parse(stdout).name).toBe('name [REDACTED]')
    expect(stdout).not.toContain(secret)
  })
  it('使い方エラーを exit 2 にし、引数内の秘密を伏せる', async () => {
    expect(await run('whoami', '--token', secret, secret, '--json')).toBe(2)
    expect(JSON.parse(stderr).error.exitCode).toBe(2)
    expect(stderr).not.toContain(secret)
    stderr = ''
    expect(await run('login', '--token')).toBe(2)
    expect(await run('--help')).toBe(0)
  })
  it('commander を in-process で実行できる', async () => {
    await buildProgram(deps)
      .exitOverride()
      .parseAsync(['node', 'hanamii', 'login', '--token', secret])
    expect(stdout).toContain('ログインしました')
  })
  it('終了コードを分類する', () => {
    expect(exitCode(new AuthError())).toBe(3)
    expect(exitCode(new NetworkError('timeout', 'timeout'))).toBe(11)
    expect(exitCode(new NetworkError())).toBe(1)
  })
})

describe('ブラウザ起動の OS 切替（プロセスは起動しない）', () => {
  const url = 'https://hanamii.jp/account/settings/tokens'
  it.each([
    ['darwin', { command: 'open', args: [url] }],
    ['linux', { command: 'xdg-open', args: [url] }],
    ['win32', { command: 'cmd.exe', args: ['/d', '/s', '/c', `start "" "${url}"`] }],
  ] as const)('%s', (platform, expected) => {
    expect(browserCommand(url, platform)).toEqual(expected)
  })
  it('Windows の cmd メタ文字を実行に渡さない', () => {
    expect(() => browserCommand('https://example.test/%PATH%', 'win32')).toThrow()
  })
})
