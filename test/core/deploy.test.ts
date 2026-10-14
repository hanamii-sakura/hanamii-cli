import { createServer, type Server } from 'node:http'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { http, HttpResponse, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { createClient } from '../../src/api/client.js'
import { deploy, type DeployEvent } from '../../src/core/deploy.js'
import { waitForDeployment } from '../../src/core/poll.js'
import { parseEnvs } from '../../src/core/env.js'
import { readProjectLink, writeProjectLink } from '../../src/config/project-link.js'
import * as zipModule from '../../src/zip/build.js'
import { main } from '../../src/cli.js'
const baseUrl = 'https://deploy.test'
const base = `${baseUrl}/api/v1`
const client = createClient({ token: 'hnm_test_token', baseUrl })
const server = setupServer()
const summary = {
  id: 'prj_app',
  name: 'app',
  workspaceId: 'ws_1',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
}
const deployment = { id: 'dep_new', readyState: 'QUEUED', errorCode: null }
let dir: string
let putServer: Server
let putUrl: string
let stages: string[]
let events: DeployEvent[]
let stdout: string
let stderr: string
let buildSpy: MockInstance<typeof zipModule.buildZip>
const stream = (body: unknown) =>
  new HttpResponse(` \n  ${JSON.stringify(body)}`, {
    headers: { 'Content-Type': 'application/json' },
  })
const project = (state = 'READY', id = 'dep_new') => ({
  ...summary,
  url: 'https://app.hanamii.app',
  latestDeployment: {
    ...deployment,
    id,
    readyState: state,
    errorCode: state === 'ERROR' ? 'build_error' : null,
  },
})
const run = (...args: string[]) =>
  main(['node', 'hanamii', 'deploy', '--dir', dir, ...args], {
    home: dir,
    env: { HANAMII_TOKEN: 'hnm_test_token', HANAMII_BASE_URL: baseUrl },
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
  })
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-deploy-'))
  await cp(resolve('test/fixtures/sample-node-app'), dir, { recursive: true })
  stages = []
  events = []
  stdout = ''
  stderr = ''
  buildSpy = vi.spyOn(zipModule, 'buildZip')
  putServer = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      stages.push('put')
      response.end()
    })
  })
  await new Promise<void>((resolve) => putServer.listen(0, '127.0.0.1', resolve))
  const address = putServer.address()
  if (!address || typeof address === 'string') throw new Error('address')
  putUrl = `http://127.0.0.1:${address.port}/upload`
  server.use(
    http.put(putUrl, () => passthrough()),
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
    http.get(`${base}/workspaces`, () => HttpResponse.json({ workspaces: [{ id: 'ws_1' }] })),
    http.post(`${base}/uploads`, async ({ request }) => {
      stages.push('upload')
      // アップロード発行時点で ZIP の書き出しが完了している。
      const zip = await buildSpy.mock.results.at(-1)!.value
      expect((await readFile(zip.zipPath)).length).toBe(zip.bytes)
      expect(await request.json()).toEqual({
        workspaceId: 'ws_1',
        fileName: 'app.zip',
        contentType: 'application/zip',
      })
      return HttpResponse.json({ upload: { id: 'up_1', uploadUrl: putUrl } })
    }),
    http.post(`${base}/uploads/up_1/check`, () => {
      stages.push('check')
      return stream({ result: { canDeploy: true, checkId: 'check_1', errors: [] } })
    }),
    http.post(`${base}/projects`, async ({ request }) => {
      stages.push('create')
      expect(await request.json()).toMatchObject({
        name: 'app',
        source: { type: 'zip', checkId: 'check_1' },
      })
      return stream({ project: summary, deployment })
    }),
    http.post(`${base}/projects/prj_app/deploy`, async ({ request }) => {
      stages.push('deploy')
      expect(await request.json()).toHaveProperty('source.type')
      return stream({ project: summary, deployment })
    }),
    http.patch(`${base}/projects/prj_app/env`, async ({ request }) => {
      stages.push('env')
      expect(await request.json()).toEqual({
        envs: [{ key: 'KEY', value: 'a=b,c', type: 'secret' }],
      })
      return HttpResponse.json({ envs: [] })
    }),
    http.get(`${base}/projects/prj_app`, () => {
      stages.push('get')
      return HttpResponse.json({ project: project() })
    }),
  )
})
afterEach(async () => {
  // すべての成功/失敗経路で一時 ZIP が削除済みであること。
  for (const result of buildSpy.mock.results)
    if (result.type === 'return') {
      const zip = await result.value.catch(() => undefined)
      if (zip) await expect(readFile(zip.zipPath)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  vi.restoreAllMocks()
  server.resetHandlers()
  putServer.closeAllConnections()
  await new Promise<void>((resolve) => putServer.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => server.close())
it('fixture の ZIP → PUT → ストリームcheck/create → READY とリンク保存', async () => {
  const result = await deploy(client, { dir, name: 'app', onEvent: (event) => events.push(event) })
  expect(result).toMatchObject({
    exitCode: 0,
    projectId: 'prj_app',
    readyState: 'READY',
    url: 'https://app.hanamii.app',
  })
  expect(stages).toEqual(['upload', 'put', 'check', 'create', 'get'])
  expect(events.map((e) => e.type)).toContain('zip')
  expect(await readProjectLink(dir)).toEqual({
    projectId: 'prj_app',
    name: 'app',
    workspaceId: 'ws_1',
  })
})
it('再デプロイは env を先に保存し no-wait でポーリングしない', async () => {
  expect(
    await deploy(client, { dir, project: 'prj_app', envs: parseEnvs(['KEY=a=b,c']), wait: false }),
  ).toMatchObject({ readyState: 'QUEUED', exitCode: 0 })
  expect(stages).toEqual(['get', 'upload', 'put', 'check', 'env', 'deploy'])
  expect(await readProjectLink(dir)).toBeDefined()
})
it('check エラーは errors[] を返し作成・リンク保存をしない', async () => {
  server.use(
    http.post(`${base}/uploads/up_1/check`, () =>
      stream({
        result: { canDeploy: false, errors: [{ type: 'invalid', message: 'invalid hnm_secret' }] },
      }),
    ),
  )
  const result = await deploy(client, { dir, name: 'app' })
  expect(result).toEqual({
    exitCode: 8,
    check: { errors: [{ type: 'invalid', message: 'invalid [REDACTED]' }] },
  })
  expect(stages).not.toContain('create')
  expect(await readProjectLink(dir)).toBeUndefined()
})
it('ERROR は10を返し、成功リンクを書かない', async () => {
  server.use(
    http.get(`${base}/projects/prj_app`, () => HttpResponse.json({ project: project('ERROR') })),
  )
  expect(await deploy(client, { dir, name: 'app' })).toMatchObject({
    exitCode: 10,
    errorCode: 'build_error',
  })
  expect(await readProjectLink(dir)).toBeUndefined()
})
it('前のREADYを無視して新しいデプロイのBUILDINGからREADYを待つ', async () => {
  let count = 0
  server.use(
    http.get(`${base}/projects/prj_app`, () => {
      count++
      return HttpResponse.json({
        project:
          count === 1 ? project('READY', 'dep_old') : project(count === 2 ? 'BUILDING' : 'READY'),
      })
    }),
  )
  const ticks: string[] = []
  await waitForDeployment(client, 'prj_app', {
    deploymentId: 'dep_new',
    intervalMs: 1,
    onTick: (p) => ticks.push(p.latestDeployment!.readyState),
  })
  expect(ticks).toEqual(['READY', 'BUILDING', 'READY'])
})
it('ポーリング期限をGET中にも適用し11、Ctrl+C相当は継続を案内する', async () => {
  server.use(
    http.get(`${base}/projects/prj_app`, () => HttpResponse.json({ project: project('BUILDING') })),
  )
  await expect(
    deploy(client, { dir, name: 'app', timeoutMs: 10, pollIntervalMs: 1 }),
  ).rejects.toMatchObject({ exitCode: 11 })
  const controller = new AbortController()
  controller.abort()
  await expect(waitForDeployment(client, 'prj_app', { signal: controller.signal })).rejects.toThrow(
    'デプロイ自体は継続',
  )
})
it.each([200, 429])('create HTTP %s の body.error は失敗し一度しか送らない', async (status) => {
  let count = 0
  server.use(
    http.post(`${base}/projects`, () => {
      count++
      return new HttpResponse('  {"error":{"code":"rate_limited","message":"fail"}}', { status })
    }),
  )
  await expect(deploy(client, { dir, name: 'app' })).rejects.toThrow('fail')
  expect(count).toBe(1)
})
it('409 に再デプロイ案内、PUT失敗でもZIPを削除', async () => {
  server.use(
    http.post(`${base}/projects`, () =>
      HttpResponse.json({ error: { code: 'conflict', message: 'exists' } }, { status: 409 }),
    ),
  )
  await expect(deploy(client, { dir, name: 'app' })).rejects.toThrow('--project <name>')
  putServer.removeAllListeners('request')
  putServer.on('request', (request, response) => {
    request.resume()
    response.writeHead(403)
    response.end()
  })
  await expect(deploy(client, { dir, name: 'app' })).rejects.toThrow('HTTP 403')
})
it('Git 再デプロイはリンクを使いZIPとcheckを省略、sourceはtypeのみ', async () => {
  await writeProjectLink(dir, { projectId: 'prj_app', name: 'app', workspaceId: 'ws_1' })
  server.use(
    http.post(`${base}/projects/prj_app/deploy`, async ({ request }) => {
      expect(await request.json()).toEqual({ source: { type: 'git' } })
      return stream({ project: summary, deployment })
    }),
  )
  expect(await run('--git', '--no-wait', '--json')).toBe(0)
  expect(JSON.parse(stdout).readyState).toBe('QUEUED')
  expect(stderr).toBe('')
  expect(buildSpy).not.toHaveBeenCalled()
})
it('CLI の複数env、timeout、no-gitignore、JSONとhuman出力', async () => {
  await writeFile(join(dir, '.gitignore'), 'package.json')
  expect(await run('--name', 'app')).toBe(5)
  server.use(
    http.post(`${base}/projects`, async ({ request }) => {
      expect(await request.json()).toMatchObject({
        envs: [
          { key: 'A', value: 'a=b', type: 'secret' },
          { key: 'B', value: '', type: 'secret' },
        ],
      })
      return stream({ project: summary, deployment })
    }),
  )
  stdout = ''
  stderr = ''
  expect(
    await run(
      '--name',
      'app',
      '--no-gitignore',
      '--env',
      'A=a=b',
      '--env',
      'B=',
      '--timeout',
      '1',
      '--json',
    ),
  ).toBe(0)
  expect(JSON.parse(stdout).readyState).toBe('READY')
  expect(stderr).toBe('')
})
it.each([
  ['--name', 'app', '--project', 'prj_app'],
  ['--name', 'app', '--git'],
  ['--timeout', 'no'],
  ['--timeout', '901'],
  ['--env', 'broken'],
])('不正なCLI指定を2で終了: %j', async (...args) => {
  expect(await run(...args)).toBe(2)
})
it.each([8, 10, 11])('CLI エラー終了コード %s とJSONの構造を維持', async (code) => {
  if (code === 8)
    server.use(
      http.post(`${base}/uploads/up_1/check`, () =>
        stream({ result: { canDeploy: false, errors: [{ type: 'invalid', message: 'bad' }] } }),
      ),
    )
  else
    server.use(
      http.get(`${base}/projects/prj_app`, () =>
        HttpResponse.json({ project: project(code === 10 ? 'ERROR' : 'BUILDING') }),
      ),
    )
  expect(await run('--name', 'app', '--timeout', '0.01', '--json')).toBe(code)
  expect(JSON.parse(stderr).error.exitCode).toBe(code)
  if (code === 8) expect(JSON.parse(stderr).error.details.check.errors).toHaveLength(1)
  expect(stdout).toBe('')
})
it('応答本文待機中にもポーリング期限を守る', async () => {
  server.use(
    http.get(
      `${base}/projects/prj_app`,
      () =>
        new HttpResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(' '))
            },
          }),
        ),
    ),
  )
  await expect(waitForDeployment(client, 'prj_app', { timeoutMs: 20 })).rejects.toMatchObject({
    exitCode: 11,
  })
})
it('CLI human は進捗をstderr、結果をstdoutに表示しSIGINTハンドラーを片付ける', async () => {
  const listeners = process.listenerCount('SIGINT')
  expect(await run('--name', 'app')).toBe(0)
  expect(stdout).toContain('公開完了')
  expect(stderr).toContain('symlink 0 件スキップ')
  expect(process.listenerCount('SIGINT')).toBe(listeners)
})
