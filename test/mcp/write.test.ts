import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { base, handlers, connect, project } from './helpers.js'
import * as upload from '../../src/api/upload-put.js'
const api = setupServer(...handlers)
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  api.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => api.close())
it('削除はopt-inのみ登録し、確認名不一致ではDELETEしない', async () => {
  const normal = await connect()
  try {
    expect((await normal.client.listTools()).tools.map((t) => t.name)).not.toContain(
      'delete_project',
    )
  } finally {
    await normal.close()
  }
  const deleted = vi.fn(() =>
    HttpResponse.json({
      project: { id: 'prj_app', deleted: false, deletion: 'accepted', operationId: 'op_1' },
    }),
  )
  api.use(http.delete(base + '/projects/prj_app', deleted))
  const s = await connect({ allowDelete: true })
  try {
    expect(
      (await s.client.listTools()).tools.find((t) => t.name === 'delete_project')?.annotations,
    ).toMatchObject({ destructiveHint: true, readOnlyHint: false, idempotentHint: false })
    expect(
      (
        await s.client.callTool({
          name: 'delete_project',
          arguments: { project: 'app', confirmName: 'wrong' },
        })
      ).isError,
    ).toBe(true)
    expect(deleted).not.toHaveBeenCalled()
    expect(
      (
        await s.client.callTool({
          name: 'delete_project',
          arguments: { project: 'app', confirmName: 'app' },
        })
      ).structuredContent,
    ).toMatchObject({ project: { operationId: 'op_1' } })
    expect(deleted).toHaveBeenCalledTimes(1)
  } finally {
    await s.close()
  }
})
it('env保存→restart、noop、health-check保存と入力検証', async () => {
  const order: string[] = []
  api.use(
    http.patch(base + '/projects/prj_app/env', async ({ request }) => {
      expect(await request.json()).toEqual({ envs: [{ key: 'A', value: 'B', type: 'secret' }] })
      order.push('env')
      return HttpResponse.json({ envs: [{ key: 'A', value: 'B', type: 'secret' }] })
    }),
    http.post(base + '/projects/prj_app/restart', () => {
      order.push('restart')
      return HttpResponse.json({ deployment: null, noop: true })
    }),
    http.put(base + '/projects/prj_app/health-check', async ({ request }) =>
      HttpResponse.json({ healthCheck: await request.json() }),
    ),
  )
  const s = await connect()
  try {
    const stdout = vi.spyOn(process.stdout, 'write')
    expect(
      (
        await s.client.callTool({
          name: 'set_env',
          arguments: { project: 'app', envs: [{ key: 'A', value: 'B' }], restart: true },
        })
      ).structuredContent,
    ).toEqual({ envs: [{ key: 'A', type: 'secret' }], restart: { deployment: null, noop: true } })
    expect(order).toEqual(['env', 'restart'])
    expect(
      (await s.client.callTool({ name: 'restart_project', arguments: { project: 'prj_app' } }))
        .structuredContent,
    ).toMatchObject({ noop: true })
    for (const enabled of [true, false]) {
      const result = await s.client.callTool({
        name: 'set_health_check',
        arguments: {
          project: 'prj_app',
          enabled,
          ...(enabled ? { path: '/health', port: 3000 } : {}),
        },
      })
      expect(result.structuredContent).toMatchObject({ healthCheck: { enabled } })
    }
    expect(
      (
        await s.client.callTool({
          name: 'set_health_check',
          arguments: { project: 'prj_app', enabled: true },
        })
      ).isError,
    ).toBe(true)
    expect(stdout).not.toHaveBeenCalled()
  } finally {
    await s.close()
  }
})
it('実core deployを実行し、wait=falseはポーリングせず、progressTokenがある時だけ通知', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-deploy-'))
  await cp(resolve('test/fixtures/sample-node-app'), dir, { recursive: true })
  vi.spyOn(upload, 'putZip').mockImplementation(async (_url, _path, onProgress) => {
    onProgress?.(10, 10)
  })
  let gets = 0
  api.use(
    http.get(base + '/projects/prj_app', () => {
      gets++
      return HttpResponse.json({ project })
    }),
    http.post(base + '/uploads', () =>
      HttpResponse.json({ upload: { id: 'up_1', uploadUrl: 'https://upload.test' } }),
    ),
    http.post(
      base + '/uploads/up_1/check',
      () =>
        new HttpResponse(' \n' + JSON.stringify({ result: { canDeploy: true, checkId: 'chk_1' } })),
    ),
    http.post(base + '/projects/prj_app/deploy', () =>
      HttpResponse.json({
        project,
        deployment: { id: 'dpl_1', readyState: 'BUILDING', errorCode: null },
      }),
    ),
  )
  const s = await connect()
  const notifications: unknown[] = []
  s.client.setNotificationHandler(ProgressNotificationSchema, (n) => {
    notifications.push(n.params)
  })
  try {
    const stdout = vi.spyOn(process.stdout, 'write')
    const args = { dir, project: 'prj_app', wait: false }
    expect(
      (await s.client.callTool({ name: 'deploy_project', arguments: args })).structuredContent,
    ).toMatchObject({ readyState: 'BUILDING' })
    expect(gets).toBe(1)
    expect(notifications).toEqual([])
    const result = await s.client.callTool({
      name: 'deploy_project',
      arguments: { ...args, wait: true },
      _meta: { progressToken: 0 },
    })
    expect(result.structuredContent).toMatchObject({ readyState: 'READY', url: project.url })
    expect(notifications.length).toBeGreaterThan(4)
    expect(notifications[0]).toMatchObject({ progressToken: 0, progress: 1 })
    expect(stdout).not.toHaveBeenCalled()
    api.use(
      http.post(base + '/uploads/up_1/check', () =>
        HttpResponse.json({
          result: { canDeploy: false, errors: [{ message: 'bad hnm_secret' }] },
        }),
      ),
    )
    const failed = await s.client.callTool({ name: 'deploy_project', arguments: args })
    expect(failed.isError).toBe(true)
    expect(failed.structuredContent).toMatchObject({
      check: { errors: [{ message: 'bad [REDACTED]' }] },
    })
  } finally {
    await s.close()
    await rm(dir, { recursive: true, force: true })
  }
})
it('waitはREADY/ERROR・timeout・進捗を返す', async () => {
  const s = await connect()
  try {
    const onprogress = vi.fn()
    expect(
      (
        await s.client.callTool(
          { name: 'wait_deployment', arguments: { project: 'prj_app' } },
          undefined,
          { onprogress },
        )
      ).structuredContent,
    ).toMatchObject({ readyState: 'READY' })
    expect(onprogress).toHaveBeenCalled()
    api.use(
      http.get(base + '/projects/prj_app', () =>
        HttpResponse.json({
          project: {
            ...project,
            latestDeployment: {
              ...project.latestDeployment,
              readyState: 'ERROR',
              errorCode: 'build_error',
            },
          },
        }),
      ),
    )
    expect(
      (await s.client.callTool({ name: 'wait_deployment', arguments: { project: 'prj_app' } }))
        .isError,
    ).toBe(true)
    api.use(
      http.get(base + '/projects/prj_app', () =>
        HttpResponse.json({ project: { ...project, latestDeployment: null } }),
      ),
    )
    const timeout = await s.client.callTool({
      name: 'wait_deployment',
      arguments: { project: 'prj_app', timeoutSec: 1 },
    })
    expect(timeout.isError).toBe(true)
    expect(JSON.stringify(timeout)).toContain('タイムアウト')
  } finally {
    await s.close()
  }
})
