import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createClient } from '../../src/api/client.js'
import { resolveWorkspace } from '../../src/core/workspace.js'
import { resolveProject } from '../../src/core/project-resolve.js'
import {
  readProjectLink,
  writeProjectLink,
  removeProjectLink,
} from '../../src/config/project-link.js'
const base = 'https://resolve.test/api/v1'
const client = createClient({ token: 'test', baseUrl: 'https://resolve.test' })
const server = setupServer()
let dir: string
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-resolve-'))
  server.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
  )
})
afterEach(async () => {
  server.resetHandlers()
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => server.close())
it('workspace 明示 / 0件 / 1件 / 複数とスコープを区別する', async () => {
  expect(await resolveWorkspace(client, 'ws_explicit')).toBe('ws_explicit')
  for (const count of [0, 1, 2]) {
    const workspaces = Array.from({ length: count }, (_, i) => ({
      id: `ws_${i}`,
      name: `team${i}`,
      role: 'owner',
    }))
    server.use(http.get(`${base}/workspaces`, () => HttpResponse.json({ workspaces })))
    if (count === 2)
      await expect(resolveWorkspace(client)).rejects.toMatchObject({ exitCode: 6, workspaces })
    else expect(await resolveWorkspace(client)).toBe(count ? 'ws_0' : undefined)
  }
  server.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'workspace' } }),
    ),
  )
  expect(await resolveWorkspace(client)).toBeUndefined()
})
it('ID は直接返し、名前は全ページ完全一致で検索する', async () => {
  expect(await resolveProject(client, { project: 'prj_direct' })).toBe('prj_direct')
  const cursors: (string | null)[] = []
  server.use(
    http.get(`${base}/projects`, ({ request }) => {
      const query = new URL(request.url).searchParams
      expect(query.get('workspaceId')).toBe('ws_1')
      cursors.push(query.get('until'))
      return HttpResponse.json({
        projects: query.has('until')
          ? [{ id: 'prj_hit', name: 'app' }]
          : [{ id: 'prj_other', name: 'app-other' }],
        pagination: { next: query.has('until') ? null : 123 },
      })
    }),
  )
  expect(await resolveProject(client, { project: 'app', workspaceId: 'ws_1' })).toBe('prj_hit')
  expect(cursors).toEqual([null, '123'])
  await expect(resolveProject(client, { project: 'missing', workspaceId: 'ws_1' })).rejects.toThrow(
    '見つかりません',
  )
})
it('同名の候補は拒否する', async () => {
  server.use(
    http.get(`${base}/projects`, () =>
      HttpResponse.json({
        projects: [
          { id: 'prj_a', name: 'app' },
          { id: 'prj_b', name: 'app' },
        ],
        pagination: { next: null },
      }),
    ),
  )
  await expect(resolveProject(client, { project: 'app' })).rejects.toThrow('同名')
})
it('リンクの保存・読取・更新・削除と暗黙解決', async () => {
  expect(await readProjectLink(dir)).toBeUndefined()
  await expect(resolveProject(client, { dir })).rejects.toThrow('未指定')
  const link = { projectId: 'prj_1', name: 'app', workspaceId: 'ws_1' }
  await writeProjectLink(dir, link)
  expect(JSON.parse(await readFile(join(dir, '.hanamii/project.json'), 'utf8'))).toEqual(link)
  expect(await resolveProject(client, { dir })).toBe('prj_1')
  await expect(resolveProject(client, { dir, workspaceId: 'ws_other' })).rejects.toThrow('一致')
  await writeProjectLink(dir, { ...link, projectId: 'prj_2' })
  expect((await readProjectLink(dir))?.projectId).toBe('prj_2')
  await writeFile(join(dir, '.hanamii/keep'), 'keep')
  await removeProjectLink(dir)
  await removeProjectLink(dir)
  expect(await readFile(join(dir, '.hanamii/keep'), 'utf8')).toBe('keep')
})
it.each(['{', '{}', '{"projectId":"bad","name":"app","workspaceId":"ws_1"}'])(
  '壊れたリンクを無視しない: %s',
  async (text) => {
    await writeProjectLink(dir, { projectId: 'prj_1', name: 'app', workspaceId: 'ws_1' })
    await writeFile(join(dir, '.hanamii/project.json'), text)
    await expect(readProjectLink(dir)).rejects.toThrow('形式')
  },
)

it('UUID 形式の ID は一覧検索せずそのまま返す', async () => {
  const id = 'd4d8450a-c1b5-4488-ab24-f0d436394ee0'
  expect(await resolveProject(client, { project: id })).toBe(id)
  expect(await resolveProject(client, { project: id.toUpperCase() })).toBe(id.toUpperCase())
})

it('UUID の projectId でリンクを書き込める', async () => {
  const link = {
    projectId: 'd4d8450a-c1b5-4488-ab24-f0d436394ee0',
    name: 'app',
    workspaceId: 'ws_1',
  }
  await writeProjectLink(dir, link)
  expect(await readProjectLink(dir)).toEqual(link)
})
