import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { redact } from '../api/errors.js'

export function format(
  data: object,
  token?: string,
  isError = false,
  text?: string,
): CallToolResult {
  const structuredContent = JSON.parse(redact(JSON.stringify(data), token)) as Record<
    string,
    unknown
  >
  return {
    content: [{ type: 'text', text: redact(text ?? JSON.stringify(structuredContent), token) }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  }
}

/** 発行した bearerToken のみを返す。他のフィールドは通常どおり伏字にする。 */
export function formatCreatedToken(
  metadata: object,
  bearerToken: string,
  authToken: string,
): CallToolResult {
  const safe = format(metadata, authToken).structuredContent!
  const structuredContent = { ...safe, bearerToken }
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
}

/** 明示的なキー発行の応答だけで平文を返す。一時キーには使わない。 */
export function formatCreatedStorageKey(
  metadata: object,
  key: string,
  authToken: string,
): CallToolResult {
  const structuredContent = { ...format(metadata, authToken).structuredContent!, key }
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
}
