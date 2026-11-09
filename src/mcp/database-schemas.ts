import { z } from 'zod'
export const database = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['creating', 'activating', 'importing', 'ready', 'deleting', 'failed']),
  hostname: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.number().nullable(),
})
export const databaseOut = { database: database.nullable() }
export const databaseToken = z.object({
  id: z.string(),
  name: z.string(),
  permission: z.enum(['read_only', 'read_write']),
  status: z.enum(['active', 'revoked', 'expired', 'disabled']),
  createdAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
})
export const databaseTokenInput = {
  name: z
    .string()
    .max(100)
    .optional()
    .describe('Display name for the connection token, at most 100 characters'),
  permission: z
    .enum(['read_only', 'read_write'])
    .optional()
    .describe('Database access permission; defaults to read_write'),
  ttlSeconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Token lifetime in seconds; defaults to 2592000 (30 days)'),
}
export const exportJob = z.object({
  id: z.string(),
  status: z.enum([
    'queued',
    'running',
    'validating',
    'uploading',
    'ready',
    'cancelled',
    'failed',
    'expired',
  ]),
  failureCode: z.string().nullable(),
  artifactSizeBytes: z.number().nullable(),
  artifactSha256: z.string().nullable(),
  artifactAvailableUntil: z.number().nullable(),
  createdAt: z.number().nullable(),
})
export const exportOut = { exportJob: exportJob.nullable() }
export const downloadOut = {
  download: z
    .object({
      url: z.string(),
      urlExpiresAt: z.number().nullable(),
      availableUntil: z.number().nullable(),
      sizeBytes: z.number(),
      sha256: z.string(),
      fileName: z.string(),
    })
    .nullable(),
}
export const exportIdParam = z
  .string()
  .min(1)
  .describe('Export job ID returned by db_create_export')
export const databaseNameParam = z
  .string()
  .max(100)
  .optional()
  .describe('Database display name, at most 100 characters; omitted means the server default')
