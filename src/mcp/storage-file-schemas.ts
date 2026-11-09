import { z } from 'zod'
export const storageFileOperationOut = {
  bucketId: z.string(),
  fileId: z.string(),
  name: z.string(),
  warnings: z.array(
    z.object({ keyId: z.string().optional(), fileId: z.string().optional(), message: z.string() }),
  ),
}
