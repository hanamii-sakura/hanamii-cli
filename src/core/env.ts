import type { EnvInput } from '../api/types.js'
import { OperationError } from './errors.js'

export function parseEnvs(values: string[]): EnvInput[] {
  return values.map((value) => {
    const index = value.indexOf('=')
    const key = value.slice(0, index).trim()
    if (index < 1 || !key) throw new OperationError('--env は K=V 形式で指定してください', 2)
    return { key, value: value.slice(index + 1), type: 'secret' }
  })
}
