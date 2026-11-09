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
/** ストレージ API の応答は envelope なし。容量・件数は丸めを避けるため 10 進の文字列。 */
export interface StoragePage<T> {
  items: T[]
  nextCursor: string | null
}
export interface StorageBucket {
  id: string
  name: string
  visibility: 'public' | 'private'
  createdAt: string
}
export interface StorageBucketPage extends StoragePage<StorageBucket> {
  apiOrigin: string
}
export interface CreateStorageBucketInput {
  name: string
  visibility: StorageBucket['visibility']
}
/** 204 は本文なし（{}）、処理が続くときは 202 で status が付く。 */
export interface StorageBucketDeletion {
  status?: 'processing'
}
export type StorageKeyPermission = 'read_only' | 'read_write'
export interface StorageAccessKey {
  keyId: string
  permission: StorageKeyPermission
  createdBy: string
  creatorEmail: string | null
  createdAt: string
  lastUsedAt: string | null
}
export interface IssuedStorageAccessKey {
  keyId: string
  permission: StorageKeyPermission
  createdAt: string
  /** 発行時の応答にだけ含まれる完全な鍵。 */
  key: string
}
export interface StorageFile {
  id: string
  name: string
  sizeBytes: string
  contentType: string
  createdAt: string
  updatedAt: string
}
export interface StorageFileViewUrl {
  url: string
  expiresAt: string | null
}
export interface StorageUsage {
  usedBytes: string
  fileCount: string
  deliveredBytes: string
  limits: {
    maxBuckets: string
    maxTotalBytes: string
    maxFiles: string
    maxFileBytes: string
  } | null
}

export interface DatabaseToken {
  id: string
  name: string
  permission: 'read_only' | 'read_write'
  status: 'active' | 'revoked' | 'expired' | 'disabled'
  createdAt: number | null
  expiresAt: number | null
  revokedAt: number | null
}
export interface DatabaseTokenInput {
  name?: string
  permission?: 'read_only' | 'read_write'
  ttlSeconds?: number
}
export interface DatabaseExportJob {
  id: string
  status:
    'queued' | 'running' | 'validating' | 'uploading' | 'ready' | 'cancelled' | 'failed' | 'expired'
  failureCode: string | null
  artifactSizeBytes: number | null
  artifactSha256: string | null
  artifactAvailableUntil: number | null
  createdAt: number | null
}
export interface DatabaseDownload {
  url: string
  urlExpiresAt: number | null
  availableUntil: number | null
  sizeBytes: number
  sha256: string
  fileName: string
}
export interface DatabaseImportSession {
  sessionId: string
  partSizeBytes: number
  parts: { partNumber: number; url: string; contentLength: number }[]
  expiresAt: number | null
}
export interface DatabaseImportInput {
  sessionId: string
  parts: { partNumber: number; etag: string }[]
  name?: string
}
