import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { main } from '../../src/cli.js'
import type { CliDependencies } from '../../src/cli/context.js'
import { readProjectLink } from '../../src/config/project-link.js'
const baseUrl = 'https://projects.test'
const base = `${baseUrl}/api/v1`
const server = setupServer()
const project = {
  id: 'prj_app',
  name: 'app',
  workspaceId: 'ws_1',
  url: 'https://app.test',
  latestDeployment: { id: 'dep_1', readyState: 'READY', errorCode: null },
  runtimeStatus: { status: 'running' },
}
let dir: string
let stdout: string
let stderr: string
let deps: CliDependencies
let deleted: number
let prompts: ReturnType<typeof vi.fn<(name: string) => Promise<string | undefined>>>
const run = (...args: string[]) => main(['node', 'hanamii', ...args], deps)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-projects-cli-'))
  stdout = ''
  stderr = ''
  deleted = 0
  prompts = vi.fn().mockResolvedValue('app')
  deps = {
    cwd: dir,
    home: dir,
    env: { HANAMII_TOKEN: 'hnm_cli_test', HANAMII_BASE_URL: baseUrl },
    isInteractive: true,
    promptProjectName: prompts,
    stdout: (t) => {
      stdout += t
    },
    stderr: (t) => {
      stderr += t
    },
  }
  server.use(
    http.get(`${base}/projects`, () =>
      HttpResponse.json({ projects: [project], pagination: { count: 1, next: null, prev: null } }),
    ),
    http.get(`${base}/projects/prj_app`, () => HttpResponse.json({ project })),
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'workspace' } }),
    ),
    http.delete(`${base}/projects/prj_app`, () => {
      deleted++
      return HttpResponse.json({ project: { id: 'prj_app', deleted: true, deletion: 'completed' } })
    }),
  )
})
afterEach(async () => {
  server.resetHandlers()
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => server.close())
it('list は通常ページと --all の全ページ、workspace と human/json を表示', async () => {
  const cursors: (string | null)[] = []
  server.use(
    http.get(`${base}/projects`, ({ request }) => {
      const query = new URL(request.url).searchParams
      expect(query.get('workspaceId')).toBe('ws_1')
      cursors.push(query.get('until'))
      return HttpResponse.json({
        projects: [{ ...project, id: query.has('until') ? 'prj_2' : 'prj_app' }],
        pagination: { count: 1, next: query.has('until') ? null : 10, prev: null },
      })
    }),
  )
  expect(await run('projects', 'list', '--workspace', 'ws_1')).toBe(0)
  expect(stdout).toContain('--all')
  expect(cursors).toEqual([null])
  stdout = ''
  expect(await run('projects', 'list', '--all', '--workspace', 'ws_1', '--json')).toBe(0)
  expect(JSON.parse(stdout).projects.map((p: { id: string }) => p.id)).toEqual(['prj_app', 'prj_2'])
})
it('空一覧と名前/IDの詳細を表示する', async () => {
  expect(await run('projects', 'get', 'app', '--json')).toBe(0)
  expect(JSON.parse(stdout).project).toEqual(project)
  stdout = ''
  expect(await run('projects', 'get', 'prj_app')).toBe(0)
  expect(stdout).toContain('ランタイム: running')
  server.use(
    http.get(`${base}/projects`, () =>
      HttpResponse.json({ projects: [], pagination: { next: null } }),
    ),
  )
  stdout = ''
  expect(await run('projects', 'list')).toBe(0)
  expect(stdout).toContain('ありません')
})
it('Git作成は正確なsourceを送り、workspaceスコープではIDを省略', async () => {
  server.use(
    http.post(`${base}/projects`, async ({ request }) => {
      expect(await request.json()).toEqual({
        name: 'app',
        source: { type: 'git', repoFullName: 'owner/repo', ref: 'main', rootDirectory: 'apps/web' },
      })
      return new HttpResponse(
        `  ${JSON.stringify({ project, deployment: { id: 'dep_new', readyState: 'QUEUED' } })}`,
      )
    }),
  )
  expect(
    await run(
      'projects',
      'create',
      '--name',
      'app',
      '--git',
      'owner/repo',
      '--ref',
      'main',
      '--root',
      'apps/web',
      '--json',
    ),
  ).toBe(0)
  expect(JSON.parse(stdout).deployment.readyState).toBe('QUEUED')
})
it('Git作成はfull_accountの複数workspaceなら6、明示すれば開始する', async () => {
  server.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({
        workspaces: [
          { id: 'ws_1', name: 'one' },
          { id: 'ws_2', name: 'two' },
        ],
      }),
    ),
    http.post(`${base}/projects`, async ({ request }) => {
      expect(await request.json()).toHaveProperty('workspaceId', 'ws_2')
      return HttpResponse.json({ project, deployment: { readyState: 'QUEUED' } })
    }),
  )
  const args = ['projects', 'create', '--name', 'app', '--git', 'owner/repo', '--ref', 'main']
  expect(await run(...args)).toBe(6)
  expect(stderr).toContain('ws_2')
  expect(await run(...args, '--workspace', 'ws_2')).toBe(0)
})
it.each([
  ['projects', 'create', '--name', 'app'],
  ['projects', 'create', '--name', 'app', '--git', 'invalid', '--ref', 'main'],
])('作成引数不足/不正は2: %j', async (...args) => {
  expect(await run(...args)).toBe(2)
})
it('削除は名前の再入力が一致した時だけ実行する', async () => {
  prompts
    .mockResolvedValueOnce('wrong')
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce('app')
  expect(await run('projects', 'delete', 'app')).toBe(1)
  expect(await run('projects', 'delete', 'prj_app')).toBe(1)
  expect(deleted).toBe(0)
  expect(await run('projects', 'delete', 'app')).toBe(0)
  expect(deleted).toBe(1)
  expect(prompts).toHaveBeenCalledWith('app')
  expect(stdout).toContain('削除完了')
})
it('非対話の削除は --yes が必須、202 は operationId を human/json に表示', async () => {
  deps.isInteractive = false
  expect(await run('projects', 'delete', 'prj_app')).toBe(2)
  expect(deleted).toBe(0)
  server.use(
    http.delete(`${base}/projects/prj_app`, () =>
      HttpResponse.json(
        {
          project: {
            id: 'prj_app',
            deleted: false,
            deletion: 'accepted',
            operationId: 'op_delete',
            requiresReview: true,
          },
        },
        { status: 202 },
      ),
    ),
  )
  expect(await run('projects', 'delete', 'prj_app', '--yes')).toBe(0)
  expect(stdout).toContain('operationId: op_delete')
  expect(stdout).not.toContain('削除完了')
  stdout = ''
  expect(await run('projects', 'delete', 'app', '--yes', '--json')).toBe(0)
  expect(JSON.parse(stdout).project.operationId).toBe('op_delete')
  expect(prompts).not.toHaveBeenCalled()
})
it('link/unlink はローカルだけ保存/解除し他の設定を残す。unlinkは認証不要', async () => {
  expect(await run('link', 'app', '--json')).toBe(0)
  expect(await readProjectLink(dir)).toEqual({
    projectId: 'prj_app',
    name: 'app',
    workspaceId: 'ws_1',
  })
  await writeFile(join(dir, '.hanamii/keep'), 'keep')
  deps.env = { HANAMII_BASE_URL: baseUrl }
  stdout = ''
  expect(await run('unlink', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ linked: false })
  expect(await readProjectLink(dir)).toBeUndefined()
  expect(await readFile(join(dir, '.hanamii/keep'), 'utf8')).toBe('keep')
  expect(await run('unlink')).toBe(0)
  expect(deleted).toBe(0)
})
it('workspace不一致は get/link/delete のどれも拒否する', async () => {
  expect(await run('projects', 'get', 'prj_app', '--workspace', 'ws_other')).toBe(2)
  expect(await run('link', 'prj_app', '--workspace', 'ws_other')).toBe(2)
  expect(await run('projects', 'delete', 'prj_app', '--workspace', 'ws_other', '--yes')).toBe(2)
  expect(deleted).toBe(0)
  expect(await readProjectLink(dir)).toBeUndefined()
})
it('作成のストリームbody.errorは再試行せず秘密を伏せる', async () => {
  let count = 0
  server.use(
    http.post(`${base}/projects`, () => {
      count++
      return new HttpResponse(' {"error":{"code":"conflict","message":"hnm_cli_test exists"}}')
    }),
  )
  expect(
    await run(
      'projects',
      'create',
      '--name',
      'app',
      '--git',
      'owner/repo',
      '--ref',
      'main',
      '--json',
    ),
  ).toBe(1)
  expect(JSON.parse(stderr).error.message).toContain('--project <name>')
  expect(stderr).not.toContain('hnm_cli_test')
  expect(count).toBe(1)
})
