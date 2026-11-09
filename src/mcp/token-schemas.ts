import { z } from 'zod'
export const tokenMetadata = z.object({
  id: z.string(),
  name: z.string(),
  scopeType: z.enum(['full_account', 'workspace']),
  scopeWorkspaceId: z.string().nullable(),
  createdAt: z.number().nullable(),
  lastUsedAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
})
export const tokenListOut = {
  tokens: z.array(tokenMetadata),
  pagination: z.object({
    count: z.number(),
    next: z.number().nullable(),
    prev: z.number().nullable(),
  }),
}
