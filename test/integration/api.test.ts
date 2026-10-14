import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { createClient } from '../../src/api/client.js'
import { deploy } from '../../src/core/deploy.js'
import { removeProjectLink } from '../../src/config/project-link.js'

const token = process.env.HANAMII_TOKEN
const client = createClient({
  token: token ?? '',
  baseUrl: process.env.HANAMII_BASE_URL ?? 'https://hanamii.jp',
})

describe.skipIf(!token)('公開 API 読取', () => {
  it('現在のトークンのメタデータ', async () => {
    const { token: metadata } = await client.getCurrentToken()
    expect(typeof metadata.name).toBe('string')
    expect(typeof metadata.scopeType).toBe('string')
  })

  it('ワークスペース一覧', async () => {
    const { workspaces } = await client.listWorkspaces()
    expect(Array.isArray(workspaces)).toBe(true)
    for (const workspace of workspaces) {
      for (const key of ['id', 'name', 'role'] as const)
        expect(typeof workspace[key]).toBe('string')
    }
  })

  it('プロジェクト一覧とページ情報', async () => {
    const { projects, pagination } = await client.listProjects({ limit: 5 })
    expect(typeof pagination.count).toBe('number')
    expect(Array.isArray(projects)).toBe(true)
    expect(projects.length).toBeLessThanOrEqual(5)
    for (const project of projects) {
      for (const key of ['id', 'name', 'workspaceId'] as const)
        expect(typeof project[key]).toBe('string')
      expect(Object.hasOwn(project, 'latestDeployment')).toBe(true)
    }
  })
})

const workspaceId = process.env.HANAMII_E2E_WORKSPACE
const dir = fileURLToPath(new URL('../fixtures/sample-node-app/', import.meta.url))

describe.skipIf(!token || process.env.HANAMII_E2E_DEPLOY !== '1' || !workspaceId)(
  '公開 API デプロイ E2E',
  () => {
    let projectId: string | undefined

    afterAll(async () => {
      try {
        if (projectId) {
          await client.deleteProject(projectId)
          await expect(client.getProject(projectId)).rejects.toMatchObject({
            status: 404,
            code: 'not_found',
          })
        }
      } finally {
        await removeProjectLink(dir)
      }
    })

    it('新規デプロイ → ログ → secret 環境変数 → 再起動', async () => {
      const result = await deploy(client, {
        dir,
        name: `cli-it-${Math.floor(Date.now() / 1000)}`,
        workspaceId: workspaceId!,
        timeoutMs: 600_000,
        // READY 待機やリンク保存が失敗しても削除できるよう、作成直後に記録する。
        onEvent: (event) => {
          if (event.type === 'deployment') projectId = event.projectId
        },
      })
      expect(result.exitCode).toBe(0)
      expect(result.readyState).toBe('READY')
      expect(result.url?.startsWith('https://')).toBe(true)
      expect(projectId).toBeDefined()
      const logs = await client.getLogsText(projectId!)
      expect(logs.includes('node server.js')).toBe(true)
      await client.setEnv(projectId!, [{ key: 'SMOKE', value: '1', type: 'secret' }])
      const { envs } = await client.getEnv(projectId!, { decrypt: true })
      expect(
        envs.some((env) => env.key === 'SMOKE' && env.value === '1' && env.type === 'secret'),
      ).toBe(true)
      const restarted = await client.restartProject(projectId!)
      expect(restarted.deployment?.readyState).toBe('READY')
    })
  },
)
