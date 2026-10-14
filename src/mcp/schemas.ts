import { z } from 'zod'
export const envSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  type: z.enum(['secret', 'plain']).default('secret'),
})
