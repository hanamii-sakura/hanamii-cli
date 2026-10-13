/** 公開 REST API v1 の時刻は epoch milliseconds。 */
export interface Pagination {
  count: number
  next: number | null
  prev: number | null
}
export interface CursorQuery {
  limit?: number
  until?: number
  since?: number
}
export interface Workspace {
  id: string
  name: string
  role: string
}
export interface Token {
  id: string
  name: string
  scopeType: 'full_account' | 'workspace'
  scopeWorkspaceId: string | null
  createdAt: number | null
  lastUsedAt: number | null
  expiresAt: number | null
}
export interface CreateTokenInput {
  name: string
  scopeType: Token['scopeType']
  scopeWorkspaceId?: string
  expiresAt?: number | null
}
export interface Deployment {
  id: string
  readyState: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR'
  errorCode: string | null
}
export interface HealthCheck {
  enabled: boolean
  path: string | null
  port: number | null
}
export type HealthCheckInput =
  { enabled: false } | { enabled: true; path: string; port?: number | null }
export interface ProjectSummary {
  id: string
  name: string
  workspaceId: string
  status: string
  createdAt: number | null
  updatedAt: number | null
}
export interface Project extends ProjectSummary {
  url: string | null
  urls: { type: 'default' | 'custom'; host: string; url: string }[]
  runtimeStatus: { status: string; detail: string | null; syncedAt: number | null }
  healthCheck: HealthCheck
  latestDeployment: Deployment | null
}
export interface EnvInput {
  key: string
  value: string
  type?: 'secret' | 'plain'
  target?: string[]
}
export interface Env {
  id: string
  key: string
  value?: string
  type: 'secret' | 'plain'
  target: string[]
  createdAt: number | null
  updatedAt: number | null
}
export type ZipSource = { type: 'zip'; checkId: string }
export interface CreateProjectInput {
  name: string
  workspaceId?: string
  source: ZipSource | { type: 'git'; repoFullName: string; ref: string; rootDirectory?: string }
  envs?: EnvInput[]
  healthCheck?: HealthCheckInput
}
export interface DeployInput {
  source: ZipSource | { type: 'git'; ref?: string }
}
export interface DeployResponse {
  project: ProjectSummary
  deployment: Deployment
}
export type RestartResponse =
  DeployResponse | { project: ProjectSummary; deployment: null; noop: true; message: string }
export type DeleteProjectResponse = {
  project:
    | { id: string; deleted: true; deletion: 'completed' }
    | {
        id: string
        deleted: false
        deletion: 'accepted'
        operationId: string
        requiresReview: boolean
      }
}
export interface Upload {
  id: string
  uploadUrl: string
  putCurl: string
  expiresAt: number
}
export interface UploadInput {
  workspaceId?: string
  fileName: string
  contentType: 'application/zip'
}
export interface CheckResult {
  checkId?: string
  canDeploy: boolean
  errorCount: number
  errors: { type: string; message: string; [key: string]: unknown }[]
}
export interface UploadChunkInput {
  chunk: Blob
  chunkIndex: number
  totalChunks: number
  uploadId?: string
  fileName?: string
  clientFiltered?: boolean
}
export type UploadChunkResponse =
  | { complete: false; uploadId: string; receivedChunks: number; totalChunks: number }
  | { complete: true; success: true; result: CheckResult }
export interface Log {
  timestamp: string
  message: string
}
export interface LogsQuery {
  limit?: number
  since?: string
  before?: string
}
export interface Database {
  id: string
  name: string
  slug: string
  status: 'creating' | 'activating' | 'importing' | 'ready' | 'deleting' | 'failed'
  hostname: string | null
  failureReason: string | null
  createdAt: number | null
}
export interface Table {
  name: string
  columns: { name: string; type: string; isPrimaryKey: boolean; isNotNull: boolean }[]
}
export type Cell =
  | null
  | number
  | string
  | { kind: 'blob'; bytes: number }
  | { kind: 'text'; value: string; truncated: true }
export interface RowsPage {
  table: string
  rows: Record<string, Cell>[]
  pagination: {
    limit: number | null
    offset: number | null
    totalCount: number | null
    totalCountTruncated: boolean
  }
}
