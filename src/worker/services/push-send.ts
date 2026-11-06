import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { pushSubscriptions } from '../db/schema'
import { writeLog } from './logger'

export interface PushPayload {
  title: string
  body: string
  taskId?: string
  url?: string
}

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export async function sendPushToAll(
  db: Db,
  vapid: VapidConfig,
  payload: PushPayload,
): Promise<void> {
  const subs = await db.select().from(pushSubscriptions)
  if (subs.length === 0) {
    void writeLog(db, 'info', 'push-send', `No subscribers — skipping push for "${payload.title}"`)
    return
  }

  void writeLog(db, 'info', 'push-send',
    `Sending push to ${subs.length} subscriber(s): "${payload.title}" — ${payload.body.slice(0, 80)}`)

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const body = JSON.stringify(payload)

  let sent = 0
  let removed = 0
  let failed = 0

  await Promise.allSettled(
    subs.map(async (sub) => {
      const keys = sub.keys as { p256dh: string; auth: string }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
          body,
        )
        sent++
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
          removed++
        } else {
          failed++
          const msg = err instanceof Error ? err.message : String(err)
          void writeLog(db, 'warn', 'push-send',
            `Push delivery failed (HTTP ${status ?? '?'}): ${msg}`)
        }
      }
    }),
  )

  void writeLog(db, 'info', 'push-send',
    `Push complete: ${sent} sent, ${removed} expired removed, ${failed} failed`)
}
