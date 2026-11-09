import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { base, connect } from './helpers.js'
import { format } from '../../src/mcp/format.js'
const api = setupServer()
const metadata = {
  id: 'tok_1',
  name: 'hnm_new_test',
  scopeType: 'workspace',
  scopeWorkspaceId: 'ws_1',
  createdAt: null,
  lastUsedAt: null,
  expiresAt: null,
}
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => api.resetHandlers())
afterAll(() => api.close())
it('一覧のページ指定と失効、発行時だけbearerTokenを返して他の項目は伏字', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const writes = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  api.use(
    http.get(`${base}/user/tokens`, ({ request }) => {
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
        limit: '10',
        until: '123',
        since: '0',
      })
      return HttpResponse.json({
        tokens: [metadata],
        pagination: { count: 1, next: null, prev: null },
      })
    }),
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'workspace', scopeWorkspaceId: 'ws_1' } }),
    ),
    http.post(`${base}/user/tokens`, async ({ request }) => {
      expect(await request.json()).toEqual({
        name: 'CI',
        scopeType: 'workspace',
        scopeWorkspaceId: 'ws_1',
      })
      return HttpResponse.json({ token: metadata, bearerToken: 'hnm_new_test' })
    }),
    http.delete(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { id: 'tok_1', deleted: true } }),
    ),
  )
  const s = await connect()
  try {
    const list = await s.client.callTool({
      name: 'list_api_tokens',
      arguments: { limit: 10, until: 123, since: 0 },
    })
    expect(JSON.stringify(list)).not.toContain('hnm_')
    const created = await s.client.callTool({
      name: 'create_api_token',
      arguments: { name: 'CI', scopeType: 'workspace' },
    })
    expect(created.structuredContent).toEqual({
      token: { ...metadata, name: '[REDACTED]' },
      bearerToken: 'hnm_new_test',
    })
    const text = (created.content as { text: string }[])[0]!.text
    expect(JSON.parse(text)).toEqual(created.structuredContent)
    expect(text.match(/hnm_new_test/g)).toHaveLength(1)
    expect(JSON.stringify(format({ token: 'hnm_new_test' }))).not.toContain('hnm_')
    expect(
      (await s.client.callTool({ name: 'revoke_api_token', arguments: { tokenId: 'current' } }))
        .structuredContent,
    ).toEqual({ token: { id: 'tok_1', deleted: true } })
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  } finally {
    await s.close()
    log.mockRestore()
    error.mockRestore()
    writes.mockRestore()
  }
})
it('scopeと有効期限を検証し、曖昧なworkspaceでは発行しない', async () => {
  const create = vi.fn(() =>
    HttpResponse.json({
      token: { ...metadata, scopeType: 'full_account', scopeWorkspaceId: null },
      bearerToken: 'hnm_new_test',
    }),
  )
  api.use(
    http.post(`${base}/user/tokens`, create),
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({ workspaces: [{ id: 'ws_a' }, { id: 'ws_b' }] }),
    ),
  )
  const s = await connect()
  try {
    for (const args of [
      { scopeType: 'full_account', workspaceId: 'ws_1' },
      { scopeType: 'full_account', expiresAt: 1 },
      { scopeType: 'workspace' },
      { scopeType: 'invalid' },
    ])
      expect(
        (await s.client.callTool({ name: 'create_api_token', arguments: { name: 'CI', ...args } }))
          .isError,
      ).toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(
      (
        await s.client.callTool({
          name: 'create_api_token',
          arguments: { name: 'CI', scopeType: 'full_account', expiresAt: null },
        })
      ).isError,
    ).not.toBe(true)
    api.use(
      http.post(`${base}/user/tokens`, () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: 'hnm_mcp_test hnm_new_test' } },
          { status: 403 },
        ),
      ),
    )
    const denied = await s.client.callTool({
      name: 'create_api_token',
      arguments: { name: 'CI', scopeType: 'full_account' },
    })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).not.toContain('hnm_')
  } finally {
    await s.close()
  }
})
