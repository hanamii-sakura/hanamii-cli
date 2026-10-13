import { DEFAULT_BASE_URL, normalizeBaseUrl } from '../config/paths.js'
import { AuthError, HanamiiApiError, NetworkError, RateLimitError, redact } from './errors.js'

export interface HttpOptions {
  token: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: object
  text?: boolean
  longRunning?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function apiError(status: number, parsed: unknown, token: string): HanamiiApiError {
  const error = parsed && typeof parsed === 'object' && 'error' in parsed ? parsed.error : undefined
  const detail = error && typeof error === 'object' ? error : {}
  const code =
    'code' in detail && typeof detail.code === 'string'
      ? redact(detail.code, token)
      : `http_${status}`
  const message =
    'message' in detail && typeof detail.message === 'string'
      ? redact(detail.message, token)
      : `API リクエストに失敗しました (HTTP ${status})`
  if (status === 401 || status === 403 || code === 'unauthorized' || code === 'forbidden')
    return new AuthError(message, status, code)
  if (status === 429 || code === 'rate_limited') return new RateLimitError(status, message)
  return new HanamiiApiError(status, code, message)
}

export function createHttp(options: HttpOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)
  return async function request<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
    const method = requestOptions.method ?? 'GET'
    const url = new URL(`${baseUrl}/api/v1${path}`)
    for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    let rateRetries = 0
    let getRetries = 0
    // ヘッダーだけでなく本文読取・再試行待機もタイムアウトの対象にする。
    const timeout = AbortSignal.timeout(
      requestOptions.timeoutMs ?? (requestOptions.longRunning ? 20 * 60_000 : 60_000),
    )
    const signal = requestOptions.signal
      ? AbortSignal.any([timeout, requestOptions.signal])
      : timeout
    try {
      while (true) {
        let response: Response
        let body: string
        try {
          signal.throwIfAborted()
          response = await (options.fetch ?? globalThis.fetch)(url, {
            method,
            headers: {
              Authorization: `Bearer ${options.token}`,
              ...(requestOptions.body === undefined || requestOptions.body instanceof FormData
                ? {}
                : { 'Content-Type': 'application/json' }),
            },
            ...(requestOptions.body === undefined
              ? {}
              : {
                  body:
                    requestOptions.body instanceof FormData
                      ? requestOptions.body
                      : JSON.stringify(requestOptions.body),
                }),
            signal,
            redirect: 'error',
          })
          body = await abortable(response.text(), signal)
        } catch {
          signal.throwIfAborted()
          if (method === 'GET' && getRetries < 2) {
            await wait(1000 * 2 ** getRetries++, signal)
            continue
          }
          throw new NetworkError()
        }
        let parsed: unknown
        let parseFailed = false
        const isText =
          requestOptions.text &&
          response.ok &&
          !response.headers.get('content-type')?.includes('application/json')
        if (isText) return body as T
        try {
          const start = body.indexOf('{')
          if (!body.trim() && response.ok) parsed = {}
          else if (start < 0) parseFailed = true
          else parsed = JSON.parse(body.slice(start))
        } catch {
          parseFailed = true
        }
        const hasError = parsed !== null && typeof parsed === 'object' && 'error' in parsed
        if (
          response.status === 429 ||
          (hasError && (parsed as { error?: { code?: string } }).error?.code === 'rate_limited')
        ) {
          if (rateRetries++ < 3) {
            const reset = Number(response.headers.get('X-RateLimit-Reset'))
            await wait(
              Math.min(
                60_000,
                Math.max(
                  0,
                  Number.isFinite(reset) && reset > 0
                    ? reset * 1000 - Date.now()
                    : 1000 * 2 ** (rateRetries - 1),
                ),
              ),
              signal,
            )
            continue
          }
          throw apiError(response.status, parsed, options.token)
        }
        if (response.status >= 500 && method === 'GET' && getRetries < 2) {
          await wait(1000 * 2 ** getRetries++, signal)
          continue
        }
        if (hasError || !response.ok) throw apiError(response.status, parsed, options.token)
        if (parseFailed)
          throw new HanamiiApiError(
            response.status,
            'invalid_response',
            'API 応答を JSON として読み取れません',
          )
        return parsed as T
      }
    } catch (error) {
      if (signal.aborted) {
        if (timeout.aborted)
          throw new NetworkError('API リクエストがタイムアウトしました', 'timeout')
        throw new NetworkError('API リクエストが中断されました', 'aborted')
      }
      throw error
    }
  }
}
