import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createClient } from '../../src/api/client.js'
import { followLogs } from '../../src/core/logs.js'
import type { Log } from '../../src/api/types.js'
const base = 'https://logs.test'
const server = setupServer()
const client = createClient({ token: 'hnm_test', baseUrl: base })
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.useRealTimers()
})
afterAll(() => server.close())
it('3秒ごとに最新時刻で取得、空バッチ・逆順・重複を処理し before は初回だけ', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const a = { timestamp: '2026-10-01T00:00:00Z', message: 'a' }
  const b = { timestamp: '2026-10-01T00:00:01Z', message: 'b' }
  const c = { timestamp: '2026-10-01T00:00:02Z', message: 'c' }
  const d = { ...c, message: 'd' }
  const pages = [[b, a, b], [], [c, b, c, d]]
  const queries: URLSearchParams[] = []
  let notify: () => void = () => undefined
  const received = () =>
    new Promise<void>((resolve) => {
      notify = resolve
    })
  server.use(
    http.get(`${base}/api/v1/projects/prj_app/logs`, ({ request }) => {
      queries.push(new URL(request.url).searchParams)
      notify()
      return HttpResponse.json({ logs: pages[queries.length - 1] ?? [] })
    }),
  )
  const controller = new AbortController()
  const batches: Log[][] = []
  const first = received()
  const running = followLogs(
    client,
    'prj_app',
    { since: '-15m', limit: 100, before: '2026-10-02T00:00:00Z' },
    {
      signal: controller.signal,
      onLogs: (logs) => {
        batches.push(logs)
        if (batches.length === 2) controller.abort()
      },
    },
  )
  await first
  // MSW の応答と HTTP 本文読取を完了させる。
  await vi.advanceTimersByTimeAsync(0)
  expect(batches).toEqual([[a, b]])
  await vi.advanceTimersByTimeAsync(2999)
  expect(queries).toHaveLength(1)
  const second = received()
  await vi.advanceTimersByTimeAsync(1)
  await second
  await vi.advanceTimersByTimeAsync(0)
  const third = received()
  await vi.advanceTimersByTimeAsync(3000)
  await third
  await running
  expect(batches).toEqual([
    [a, b],
    [c, d],
  ])
  expect(queries.map((q) => q.get('since'))).toEqual(['-15m', b.timestamp, b.timestamp])
  expect(queries.map((q) => q.get('before'))).toEqual(['2026-10-02T00:00:00Z', null, null])
})
it('取得中の中断は正常終了、API エラーは伝播', async () => {
  const controller = new AbortController()
  server.use(
    http.get(`${base}/api/v1/projects/prj_app/logs`, () => {
      controller.abort()
      return HttpResponse.json({ logs: [] })
    }),
  )
  const onLogs = vi.fn()
  await expect(
    followLogs(client, 'prj_app', {}, { signal: controller.signal, onLogs }),
  ).resolves.toBeUndefined()
  expect(onLogs).not.toHaveBeenCalled()
  server.use(
    http.get(`${base}/api/v1/projects/prj_app/logs`, () =>
      HttpResponse.json({ error: { code: 'forbidden', message: 'no access' } }),
    ),
  )
  await expect(followLogs(client, 'prj_app', {}, { onLogs })).rejects.toMatchObject({
    code: 'forbidden',
  })
})
it('待機中の中断はタイマーを解除する', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const controller = new AbortController()
  server.use(
    http.get(`${base}/api/v1/projects/prj_app/logs`, () => HttpResponse.json({ logs: [] })),
  )
  const running = followLogs(client, 'prj_app', {}, { signal: controller.signal, onLogs: vi.fn() })
  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  await running
  expect(vi.getTimerCount()).toBe(0)
})
