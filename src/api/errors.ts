export function redact(value: string, token?: string): string {
  const safe = token ? value.split(token).join('[REDACTED]') : value
  return safe.replace(/hnm_[A-Za-z0-9_-]+/g, '[REDACTED]')
}

export class HanamiiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(redact(message))
    this.name = 'HanamiiApiError'
  }
}

export class AuthError extends HanamiiApiError {
  constructor(
    message = '認証が必要です。hanamii login を実行してください',
    status = 401,
    code = 'unauthorized',
  ) {
    super(status, code, message)
    this.name = 'AuthError'
  }
}

export class RateLimitError extends HanamiiApiError {
  constructor(status: number, message: string) {
    super(status, 'rate_limited', message)
    this.name = 'RateLimitError'
  }
}

export class NetworkError extends Error {
  constructor(
    message = 'API への接続に失敗しました',
    public readonly code: 'network_error' | 'timeout' | 'aborted' = 'network_error',
  ) {
    super(message)
    this.name = 'NetworkError'
  }
}
