import { createHttp, type HttpOptions, type RequestOptions } from './http.js'
import type * as T from './types.js'

export type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>
const segment = (value: string) => {
  if (!value || value === '.' || value === '..') throw new Error('パスの識別子が不正です')
  return encodeURIComponent(value)
}
const projectPath = (id: string) => `/projects/${segment(id)}`

/** 応答の envelope と pagination を維持する、公開 v1 API の薄いラッパー。 */
export function createClient(options: HttpOptions) {
  const request = createHttp(options)
  return {
    listWorkspaces: (call: CallOptions = {}) =>
      request<{ workspaces: T.Workspace[] }>('/workspaces', call),
    listTokens: (query: T.CursorQuery = {}, call: CallOptions = {}) =>
      request<{ tokens: T.Token[]; pagination: T.Pagination }>('/user/tokens', { ...call, query }),
    getToken: (id: string, call: CallOptions = {}) =>
      request<{ token: T.Token }>(`/user/tokens/${segment(id)}`, call),
    getCurrentToken: (call: CallOptions = {}) =>
      request<{ token: T.Token }>('/user/tokens/current', call),
    createToken: (body: T.CreateTokenInput, call: CallOptions = {}) =>
      request<{ token: T.Token; bearerToken: string }>('/user/tokens', {
        ...call,
        method: 'POST',
        body,
      }),
    revokeToken: (id: string, call: CallOptions = {}) =>
      request<{ token: { id: string; deleted: true } }>(`/user/tokens/${segment(id)}`, {
        ...call,
        method: 'DELETE',
      }),
    listProjects: (query: T.CursorQuery & { workspaceId?: string } = {}, call: CallOptions = {}) =>
      request<{ projects: T.Project[]; pagination: T.Pagination }>('/projects', { ...call, query }),
    getProject: (id: string, call: CallOptions = {}) =>
      request<{ project: T.Project }>(projectPath(id), call),
    createProject: (body: T.CreateProjectInput, call: CallOptions = {}) =>
      request<T.DeployResponse>('/projects', { ...call, method: 'POST', body, longRunning: true }),
    deleteProject: (id: string, call: CallOptions = {}) =>
      request<T.DeleteProjectResponse>(projectPath(id), { ...call, method: 'DELETE' }),
    deployProject: (id: string, body: T.DeployInput, call: CallOptions = {}) =>
      request<T.DeployResponse>(`${projectPath(id)}/deploy`, {
        ...call,
        method: 'POST',
        body,
        longRunning: true,
      }),
    restartProject: (id: string, call: CallOptions = {}) =>
      request<T.RestartResponse>(`${projectPath(id)}/restart`, {
        ...call,
        method: 'POST',
        longRunning: true,
      }),
    createUpload: (body: T.UploadInput, call: CallOptions = {}) =>
      request<{ upload: T.Upload }>('/uploads', { ...call, method: 'POST', body }),
    checkUpload: (id: string, call: CallOptions = {}) =>
      request<{ result: T.CheckResult }>(`/uploads/${segment(id)}/check`, {
        ...call,
        method: 'POST',
        body: {},
        longRunning: true,
      }),
    checkUploadChunk: (input: T.UploadChunkInput, call: CallOptions = {}) => {
      const body = new FormData()
      body.append('chunk', input.chunk, input.fileName ?? 'chunk.zip')
      for (const [key, value] of Object.entries(input))
        if (key !== 'chunk' && value !== undefined) body.append(key, String(value))
      return request<T.UploadChunkResponse>('/uploads/check', {
        ...call,
        method: 'POST',
        body,
        longRunning: true,
      })
    },
    getEnv: (id: string, query: { decrypt?: boolean } = {}, call: CallOptions = {}) =>
      request<{ envs: T.Env[] }>(`${projectPath(id)}/env`, { ...call, query }),
    setEnv: (id: string, envs: T.EnvInput[], call: CallOptions = {}) =>
      request<{ envs: T.Env[] }>(`${projectPath(id)}/env`, {
        ...call,
        method: 'PATCH',
        body: { envs },
      }),
    getHealthCheck: (id: string, call: CallOptions = {}) =>
      request<{ healthCheck: T.HealthCheck }>(`${projectPath(id)}/health-check`, call),
    setHealthCheck: (id: string, body: T.HealthCheckInput, call: CallOptions = {}) =>
      request<{ healthCheck: T.HealthCheck }>(`${projectPath(id)}/health-check`, {
        ...call,
        method: 'PUT',
        body,
      }),
    getLogs: (id: string, query: T.LogsQuery = {}, call: CallOptions = {}) =>
      request<{ logs: T.Log[] }>(`${projectPath(id)}/logs`, { ...call, query }),
    getLogsText: (id: string, query: T.LogsQuery = {}, call: CallOptions = {}) =>
      request<string>(`${projectPath(id)}/logs`, {
        ...call,
        query: { ...query, format: 'text' },
        text: true,
      }),
    getDatabase: (id: string, call: CallOptions = {}) =>
      request<{ database: T.Database | null }>(`${projectPath(id)}/database`, call),
    listDatabaseTables: (id: string, call: CallOptions = {}) =>
      request<{ tables: T.Table[] }>(`${projectPath(id)}/database/tables`, call),
    getDatabaseRows: (
      id: string,
      table: string,
      query: { limit?: number; offset?: number } = {},
      call: CallOptions = {},
    ) =>
      request<T.RowsPage>(`${projectPath(id)}/database/tables/${segment(table)}/rows`, {
        ...call,
        query,
      }),
  }
}
export type HanamiiClient = ReturnType<typeof createClient>
