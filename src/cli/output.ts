import { OperationError } from '../core/errors.js'
import { WorkspaceAmbiguousError } from '../core/workspace.js'
import { PrecheckError } from '../zip/precheck.js'
import { AuthError, NetworkError, redact } from '../api/errors.js'

export class UsageError extends Error {}

export function exitCode(error: unknown): number {
  if (
    error instanceof OperationError ||
    error instanceof WorkspaceAmbiguousError ||
    error instanceof PrecheckError
  )
    return error.exitCode
  if (error instanceof AuthError) return 3
  if (error instanceof UsageError) return 2
  if (error instanceof NetworkError && error.code === 'timeout') return 11
  return 1
}

export function createOutput(stdout: (text: string) => void, stderr: (text: string) => void) {
  const secrets = new Set<string>()
  const clean = (text: string) => {
    for (const token of secrets) text = redact(text, token)
    return redact(text)
  }
  return {
    // 発行直後の bearerToken だけを一度表示する。他のフィールドは通常どおりマスクする。
    createdToken: (metadata: unknown, bearerToken: string, json: boolean) => {
      secrets.add(bearerToken)
      stdout(
        json
          ? `${JSON.stringify({ token: JSON.parse(clean(JSON.stringify(metadata))) as unknown, bearerToken })}\n`
          : `トークンを作成しました。この値は一度だけ表示されます。\n${bearerToken}\n`,
      )
    },
    remember: (token: string | undefined) => {
      if (token) secrets.add(token)
    },
    write: (text: string) => stdout(clean(text)),
    error: (text: string) => stderr(clean(text)),
    result: (data: unknown, human: string, json: boolean) =>
      stdout(clean(`${json ? JSON.stringify(data) : human}\n`)),
  }
}
