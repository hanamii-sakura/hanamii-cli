import { z } from 'zod'

/** 全ツール共通のプロジェクト指定。ID か名前のどちらでも受け付ける。 */
export const projectParam = z
  .string()
  .min(1)
  .describe(
    'Target project: the project ID (UUID) or the exact project name as shown by list_projects. A name that matches several projects is an error. Example: "my-app"',
  )
export const envSchema = z.object({
  key: z.string().min(1).describe('Environment variable name, e.g. "DATABASE_URL"'),
  value: z
    .string()
    .describe(
      'Plain-text value. Take secrets from the user or local config; the value is never echoed back in responses',
    ),
  type: z
    .enum(['secret', 'plain'])
    .default('secret')
    .describe('"secret" (default) masks the value in the dashboard; "plain" shows it as is'),
})
export const workspaceParam = z
  .string()
  .optional()
  .describe(
    'Workspace ID (UUID) from list_workspaces. Omit when the token can reach only one workspace',
  )
export const bucketParam = z
  .string()
  .min(1)
  .describe(
    'Target bucket: the bucket ID or the exact bucket name as shown by storage_list_buckets. Example: "uploads"',
  )
export const cursorParam = z
  .string()
  .optional()
  .describe('Opaque nextCursor value returned by the previous page. Omit for the first page')

// --- 出力スキーマ ---
// 形を伝えるのが目的。API の項目追加や省略で呼び出しが失敗しないよう、入れ子は loose、項目は optional にする
const deploymentOut = z
  .looseObject({
    id: z.string().optional(),
    readyState: z.enum(['QUEUED', 'BUILDING', 'READY', 'ERROR']).optional(),
    errorCode: z.string().nullable().optional(),
  })
  .describe('Deployment state')
const projectOut = z
  .looseObject({
    id: z.string().optional().describe('Project ID (UUID)'),
    name: z.string().optional(),
    workspaceId: z.string().optional(),
    url: z
      .string()
      .nullable()
      .optional()
      .describe('Public URL, null until the first successful deployment'),
    latestDeployment: deploymentOut.nullable().optional(),
  })
  .describe('Project')
const healthCheckOut = z.looseObject({
  enabled: z.boolean().optional(),
  path: z.string().nullable().optional(),
  port: z.number().nullable().optional(),
})
const paginationOut = z.looseObject({
  count: z.number().nullable().optional(),
  next: z.number().nullable().optional(),
  prev: z.number().nullable().optional(),
})
export const workspacesOut = {
  workspaces: z.array(
    z.looseObject({ id: z.string(), name: z.string().optional(), role: z.string().optional() }),
  ),
}
export const projectsOut = { projects: z.array(projectOut), pagination: paginationOut.optional() }
export const projectDetailOut = { project: projectOut }
export const logsOut = {
  logs: z.array(
    z.looseObject({ timestamp: z.string().optional(), message: z.string().optional() }),
  ),
}
export const envsOut = {
  envs: z.array(
    z.looseObject({
      key: z.string(),
      type: z.enum(['secret', 'plain']).optional(),
      value: z.string().optional().describe('Present only when decrypt=true'),
    }),
  ),
}
export const healthCheckResultOut = { healthCheck: healthCheckOut }
export const tablesOut = {
  tables: z.array(
    z.looseObject({
      name: z.string(),
      columns: z
        .array(z.looseObject({ name: z.string().optional(), type: z.string().optional() }))
        .optional(),
    }),
  ),
}
export const rowsOut = {
  table: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
  pagination: z
    .looseObject({
      limit: z.number().nullable().optional(),
      offset: z.number().nullable().optional(),
      totalCount: z.number().nullable().optional(),
    })
    .optional(),
}
export const deployOut = {
  exitCode: z
    .number()
    .describe(
      '0 on success, 8 when the pre-check rejected the upload, 10 when the deployment ended in ERROR',
    ),
  projectId: z.string().optional(),
  url: z.string().nullable().optional(),
  readyState: z.string().optional(),
  errorCode: z.string().nullable().optional(),
  check: z
    .looseObject({
      errors: z.array(
        z.looseObject({ type: z.string().optional(), message: z.string().optional() }),
      ),
    })
    .optional(),
}
export const waitOut = {
  projectId: z.string(),
  url: z.string().nullable().optional(),
  readyState: z.string().optional(),
  errorCode: z.string().nullable().optional(),
}
const restartOut = z.looseObject({
  project: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
  deployment: deploymentOut.nullable().optional(),
  noop: z.boolean().optional().describe('true when nothing had to be applied'),
  message: z.string().optional(),
})
export const restartResultOut = { ...restartOut.shape }
export const setEnvOut = {
  envs: z.array(z.looseObject({ key: z.string(), type: z.enum(['secret', 'plain']).optional() })),
  restart: restartOut.optional().describe('Present only when restart=true'),
}
export const deleteOut = {
  project: z.looseObject({
    id: z.string().optional(),
    deleted: z.boolean().optional(),
    deletion: z.enum(['completed', 'accepted']).optional(),
    operationId: z.string().optional(),
  }),
}
const bucketOut = z.looseObject({
  id: z.string().describe('Bucket ID'),
  name: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  createdAt: z.string().optional().describe('ISO 8601 timestamp'),
})
const nextCursorOut = z
  .string()
  .nullable()
  .optional()
  .describe('Pass as cursor to read the next page; null on the last page')
export const bucketsOut = {
  workspaceId: z.string(),
  items: z.array(bucketOut),
  nextCursor: nextCursorOut,
  apiOrigin: z
    .string()
    .optional()
    .describe('Base URL of the file API that apps call with an access key'),
}
export const bucketCreatedOut = { workspaceId: z.string(), ...bucketOut.shape }
export const bucketDeletedOut = {
  bucketId: z.string(),
  name: z.string().optional(),
  status: z
    .enum(['completed', 'processing'])
    .describe('"processing" while public and shared URLs are still being shut down'),
}
export const accessKeysOut = {
  bucketId: z.string(),
  items: z.array(
    z.looseObject({
      keyId: z.string(),
      permission: z.enum(['read_only', 'read_write']).optional(),
      creatorEmail: z.string().nullable().optional(),
      createdAt: z.string().optional(),
      lastUsedAt: z.string().nullable().optional(),
    }),
  ),
  nextCursor: nextCursorOut,
}
export const accessKeyIssuedOut = {
  bucketId: z.string(),
  keyId: z.string(),
  permission: z.enum(['read_only', 'read_write']).optional(),
  createdAt: z.string().optional(),
  key: z.string().describe('Full secret key. Returned only by this call and never shown again'),
  apiOrigin: z
    .string()
    .optional()
    .describe('Base URL of the file API to use together with the key'),
}
export const accessKeyRevokedOut = { bucketId: z.string(), keyId: z.string(), revoked: z.boolean() }
export const storageFilesOut = {
  bucketId: z.string(),
  items: z.array(
    z.looseObject({
      id: z.string().describe('File ID'),
      name: z.string().optional(),
      sizeBytes: z.string().optional().describe('Size in bytes as a decimal string'),
      contentType: z.string().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    }),
  ),
  nextCursor: nextCursorOut,
}
export const storageFileUrlOut = {
  url: z.string(),
  expiresAt: z
    .string()
    .nullable()
    .optional()
    .describe('Expiry of a private bucket URL (one hour); null for a public bucket'),
}
export const storageUsageOut = {
  workspaceId: z.string(),
  usedBytes: z.string().optional().describe('Stored bytes as a decimal string'),
  fileCount: z.string().optional(),
  deliveredBytes: z.string().optional().describe('Approximate bytes delivered this month'),
  limits: z
    .looseObject({
      maxBuckets: z.string().optional(),
      maxTotalBytes: z.string().optional(),
      maxFiles: z.string().optional(),
      maxFileBytes: z.string().optional(),
    })
    .nullable()
    .optional()
    .describe('Plan limits; all zero while the workspace is restricted, null when unknown'),
}
