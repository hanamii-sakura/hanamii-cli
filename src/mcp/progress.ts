import { redact } from '../api/errors.js'
import type { Extra } from './context.js'

/** core の同期コールバックから通知を順序どおり送り、返却前に送信を完了する。 */
export function progress(extra: Extra, token: string) {
  let pending = Promise.resolve()
  let count = 0
  return {
    notify(event: object) {
      const progressToken = extra._meta?.progressToken
      if (progressToken === undefined) return
      const value = ++count
      pending = pending
        .then(() =>
          extra.sendNotification({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress: value,
              message: redact(JSON.stringify(event), token),
            },
          }),
        )
        .catch(() => {
          console.error('進捗通知を送信できませんでした')
        })
    },
    flush: () => pending,
  }
}
