import { redact } from '../api/errors.js'

export class OperationError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly details?: unknown,
  ) {
    super(redact(message))
  }
}
