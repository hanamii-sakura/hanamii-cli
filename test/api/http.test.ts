import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createHttp } from '../../src/api/http.js'
import { AuthError, HanamiiApiError, NetworkError, RateLimitError } from '../../src/api/errors.js'

const server = setupServer()
const endpoint = 'https://api.example.test/api/v1/test'
const secret = 'hnm_test_secret'
const request = createHttp({ token: secret, baseUrl: 'https://api.example.test' })
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.useRealTimers()
})
afterAll(() => server.close())

describe('HTTP', () => {
  it('Bearer と JSON を送り、分割された keep-alive 本文を最後まで読む', async () => {
    server.use(
      http.post(endpoint, async ({ request }) => {
        expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`)
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(await request.json()).toEqual({ value: 1 })
        const encoder = new TextEncoder()
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              for (const part of [' \n', ' ', '{"value":', '"with spaces"}'])
                controller.enqueue(encoder.encode(part))
              controller.close()
            },
          }),
        )
      }),
    )
    expect(await request('/test', { method: 'POST', body: { value: 1 } })).toEqual({
      value: 'with spaces',
    })
  })
  it.each([200, 400, 401, 403])('HTTP %i の error を検出し秘密を伏せる', async (status) => {
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: `invalid ${secret}` } },
          { status },
        ),
      ),
    )
    const error = await request('/test').catch((error: unknown) => error)
    expect(error).toBeInstanceOf(AuthError)
    expect(error).toMatchObject({ status, code: 'forbidden', message: 'invalid [REDACTED]' })
    expect(JSON.stringify(error)).not.toContain(secret)
  })
  it('空の成功・不正 JSON・error:null を区別する', async () => {
    server.use(http.get(endpoint, () => new HttpResponse(null, { status: 204 })))
    expect(await request('/test')).toEqual({})
    server.use(http.get(endpoint, () => new HttpResponse('not json')))
    await expect(request('/test')).rejects.toMatchObject({ code: 'invalid_response' })
    server.use(http.get(endpoint, () => HttpResponse.json({ error: null })))
    await expect(request('/test')).rejects.toBeInstanceOf(HanamiiApiError)
  })
  it('text ログと JSON エラーを区別する', async () => {
    server.use(http.get(endpoint, () => HttpResponse.text('12:00 hello {world}')))
    expect(await request('/test', { text: true })).toBe('12:00 hello {world}')
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ error: { code: 'not_found', message: 'missing' } }, { status: 404 }),
      ),
    )
    await expect(request('/test', { text: true })).rejects.toMatchObject({ code: 'not_found' })
  })
  it('429 は epoch 秒まで待機して最大3回、1回の待機は60秒まで', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    let calls = 0
    server.use(
      http.post(endpoint, () => {
        calls++
        return HttpResponse.json(
          { error: { code: 'rate_limited', message: 'wait' } },
          { status: 429, headers: { 'X-RateLimit-Reset': String(Date.now() / 1000 + 120) } },
        )
      }),
    )
    const result = request('/test', { method: 'POST', longRunning: true }).catch(
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toBe(2)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await result).toBeInstanceOf(RateLimitError)
    expect(calls).toBe(4)
  })
  it.each(['network', 'server'])('GET の %s エラーだけ2回再試行する', async (kind) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let calls = 0
    server.use(
      http.all(endpoint, () => {
        calls++
        return kind === 'network'
          ? HttpResponse.error()
          : new HttpResponse('unavailable', { status: 503 })
      }),
    )
    const result = request('/test').catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await result).toBeInstanceOf(kind === 'network' ? NetworkError : HanamiiApiError)
    expect(calls).toBe(3)
    calls = 0
    await expect(request('/test', { method: 'POST' })).rejects.toBeInstanceOf(Error)
    expect(calls).toBe(1)
  })
  it('本文受信中もタイムアウトし、キャンセルも区別する', async () => {
    server.use(
      http.get(
        endpoint,
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
    await expect(request('/test', { timeoutMs: 30 })).rejects.toMatchObject({ code: 'timeout' })
    await expect(request('/test', { signal: AbortSignal.abort() })).rejects.toMatchObject({
      code: 'aborted',
    })
  })
  it('通常60秒、長時間POST20分の期限を使う', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    server.use(http.all(endpoint, () => HttpResponse.json({})))
    await request('/test')
    await request('/test', { method: 'POST', longRunning: true })
    expect(spy.mock.calls).toEqual([[60_000], [1_200_000]])
    spy.mockRestore()
  })
})
