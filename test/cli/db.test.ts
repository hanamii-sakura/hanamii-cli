import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { main } from '../../src/cli.js'
import type { CliDependencies } from '../../src/cli/context.js'
import { writeProjectLink } from '../../src/config/project-link.js'
const base = 'https://db.test/api/v1'
const server = setupServer()
let dir: string
let stdout: string
let stderr: string
let deps: CliDependencies
const run = (...args: string[]) => main(['node', 'hanamii', 'db', ...args], deps)
const database = {
  id: 'db_1',
  name: 'app-db',
  slug: 'app-db',
  status: 'ready',
  hostname: 'db.example',
  failureReason: null,
  createdAt: null,
}
const tables = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', isPrimaryKey: true, isNotNull: true },
      { name: 'name', type: 'TEXT', isPrimaryKey: false, isNotNull: false },
    ],
  },
]
const page = {
  table: 'users',
  rows: [
    {
      id: 1,
      name: 'Alice',
      nullable: null,
      data: { kind: 'blob', bytes: 4 },
      text: { kind: 'text', value: 'long\ntext', truncated: true },
    },
  ],
  pagination: { limit: 50, offset: 0, totalCount: 1, totalCountTruncated: false },
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-db-'))
  stdout = ''
  stderr = ''
  deps = {
    cwd: dir,
    home: dir,
    env: { HANAMII_TOKEN: 'hnm_db_test', HANAMII_BASE_URL: 'https://db.test' },
    stdout: (t) => {
      stdout += t
    },
    stderr: (t) => {
      stderr += t
    },
  }
  await writeProjectLink(dir, { projectId: 'prj_app', name: 'app', workspaceId: 'ws_1' })
  server.use(
    http.get(`${base}/projects`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('workspaceId')).toBe('ws_1')
      return HttpResponse.json({
        projects: [{ id: 'prj_app', name: 'app' }],
        pagination: { next: null },
      })
    }),
    http.get(`${base}/projects/prj_app`, () =>
      HttpResponse.json({ project: { id: 'prj_app', workspaceId: 'ws_1' } }),
    ),
    http.get(`${base}/projects/prj_app/database`, () => HttpResponse.json({ database })),
    http.get(`${base}/projects/prj_app/database/tables`, () => HttpResponse.json({ tables })),
  )
})
afterEach(async () => {
  server.resetHandlers()
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => server.close())
it('info はリンク・名前・ID を解決し human/json 表示', async () => {
  expect(await run('info')).toBe(0)
  expect(stdout).toContain('db_1\tapp-db\tready')
  expect(stdout).toContain('ホスト: db.example')
  stdout = ''
  expect(await run('info', '--project', 'app', '--workspace', 'ws_1', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ database })
  stdout = ''
  expect(await run('info', '--project', 'prj_app', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ database })
})
it('database:null は成功として扱う', async () => {
  server.use(
    http.get(`${base}/projects/prj_app/database`, () => HttpResponse.json({ database: null })),
  )
  expect(await run('info')).toBe(0)
  expect(stdout).toBe('データベースはありません\n')
  stdout = ''
  expect(await run('info', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ database: null })
})
it('tables の列定義と空一覧を表示', async () => {
  expect(await run('tables')).toBe(0)
  expect(stdout).toContain('users\tid INTEGER PRIMARY KEY NOT NULL, name TEXT')
  stdout = ''
  expect(await run('tables', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ tables })
  server.use(
    http.get(`${base}/projects/prj_app/database/tables`, () => HttpResponse.json({ tables: [] })),
  )
  stdout = ''
  expect(await run('tables')).toBe(0)
  expect(stdout).toContain('テーブルはありません')
})
it('rows の既定値・ページ指定と複合セルを表示、JSON は応答を保持', async () => {
  const queries: string[] = []
  server.use(
    http.get(`${base}/projects/prj_app/database/tables/users/rows`, ({ request }) => {
      queries.push(new URL(request.url).search)
      return HttpResponse.json(page)
    }),
  )
  expect(await run('rows', 'users')).toBe(0)
  expect(stdout).toContain(
    'id\tname\tnullable\tdata\ttext\n1\tAlice\tNULL\t[BLOB: 4 bytes]\tlong\\ntext（省略あり）',
  )
  expect(stdout).toContain('総件数: 1')
  stdout = ''
  expect(await run('rows', 'users', '--limit', '100', '--offset', '50', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual(page)
  expect(queries).toEqual(['?limit=50&offset=0', '?limit=100&offset=50'])
})
it('特殊なテーブル名をパスエンコード、空の行と集計上限を表示', async () => {
  server.use(
    http.get(`${base}/projects/prj_app/database/tables/:table/rows`, ({ request }) => {
      expect(new URL(request.url).pathname).toContain('a%2Fb%20%23')
      return HttpResponse.json({
        table: 'a/b #',
        rows: [],
        pagination: { limit: 50, offset: 0, totalCount: 10000, totalCountTruncated: true },
      })
    }),
  )
  expect(await run('rows', 'a/b #')).toBe(0)
  expect(stdout).toContain('行はありません')
  expect(stdout).toContain('10000（集計上限あり）')
})
it('不正なページ指定と書込コマンドを拒否', async () => {
  for (const args of [
    ['--limit', '0'],
    ['--limit', '101'],
    ['--limit', '1.5'],
    ['--offset', '-1'],
    ['--offset', '1000001'],
    ['--offset', 'bad'],
  ])
    expect(await run('rows', 'users', ...args)).toBe(2)
  expect(await run('create')).toBe(2)
  expect(await run('delete')).toBe(2)
})
it('権限エラーは終了コード3、トークンを表示しない', async () => {
  server.use(
    http.get(`${base}/projects/prj_app/database/tables`, () =>
      HttpResponse.json(
        { error: { code: 'forbidden', message: 'denied hnm_db_test' } },
        { status: 403 },
      ),
    ),
  )
  expect(await run('tables', '--json')).toBe(3)
  expect(JSON.parse(stderr).error.exitCode).toBe(3)
  expect(stderr).not.toContain('hnm_')
  expect(stdout).toBe('')
})
