import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { base, connect, handlers, project } from './helpers.js'
const api = setupServer(...handlers)
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => api.resetHandlers())
afterAll(() => api.close())
it('GitHub作成は正確なsourceを送り、既存ソース再デプロイはrefを送らない', async () => {
  const bodies: unknown[] = []
  const response = { project, deployment: { id: 'dpl_1', readyState: 'BUILDING', errorCode: null } }
  api.use(
    http.post(`${base}/projects`, async ({ request }) => {
      bodies.push(await request.json())
      return new HttpResponse(` \n ${JSON.stringify(response)}`)
    }),
    http.post(`${base}/projects/prj_app/deploy`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(response)
    }),
  )
  const s = await connect()
  try {
    const result = await s.client.callTool({
      name: 'create_git_project',
      arguments: {
        name: 'app',
        repoFullName: 'owner/repo',
        ref: 'main',
        rootDirectory: 'apps/web',
        workspaceId: 'ws_1',
      },
    })
    expect(result.structuredContent).toMatchObject({
      projectId: 'prj_app',
      readyState: 'READY',
      url: project.url,
      exitCode: 0,
    })
    expect(
      (
        await s.client.callTool({
          name: 'redeploy_git_project',
          arguments: { project: 'app', wait: false },
        })
      ).structuredContent,
    ).toMatchObject({ readyState: 'BUILDING', exitCode: 0 })
    expect(bodies).toEqual([
      {
        name: 'app',
        workspaceId: 'ws_1',
        source: { type: 'git', repoFullName: 'owner/repo', ref: 'main', rootDirectory: 'apps/web' },
      },
      { source: { type: 'git' } },
    ])
    expect(
      (
        await s.client.callTool({
          name: 'create_git_project',
          arguments: { name: 'app', repoFullName: 'invalid', ref: 'main' },
        })
      ).isError,
    ).toBe(true)
    expect(bodies).toHaveLength(2)
  } finally {
    await s.close()
  }
})
it('workspaceの曖昧さ・Git権限エラー・ストリームエラーとデプロイERROR', async () => {
  api.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({ workspaces: [{ id: 'ws_a' }, { id: 'ws_b' }] }),
    ),
    http.post(
      `${base}/projects/prj_app/deploy`,
      () => new HttpResponse(' \n {"error":{"code":"forbidden","message":"hnm_mcp_test"}}'),
    ),
  )
  const s = await connect()
  try {
    expect(
      (
        await s.client.callTool({
          name: 'create_git_project',
          arguments: { name: 'app', repoFullName: 'owner/repo', ref: 'main' },
        })
      ).isError,
    ).toBe(true)
    const denied = await s.client.callTool({
      name: 'redeploy_git_project',
      arguments: { project: 'app' },
    })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).not.toContain('hnm_')
    api.use(
      http.post(`${base}/projects/prj_app/deploy`, () =>
        HttpResponse.json({
          project,
          deployment: { id: 'dpl_1', readyState: 'ERROR', errorCode: 'build_failed' },
        }),
      ),
    )
    const failed = await s.client.callTool({
      name: 'redeploy_git_project',
      arguments: { project: 'app' },
    })
    expect(failed.isError).toBe(true)
    expect(failed.structuredContent).toMatchObject({ exitCode: 10, readyState: 'ERROR' })
  } finally {
    await s.close()
  }
})
