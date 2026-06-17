import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { pushSubscriptions } from '../db/schema'

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
  if (subs.length === 0) return

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const body = JSON.stringify(payload)

  await Promise.allSettled(
    subs.map(async (sub) => {
      const keys = sub.keys as { p256dh: string; auth: string }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
          body,
        )
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Subscription is gone — delete it
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
        } else {
          console.error('[push-send] failed to send to endpoint:', sub.endpoint, err)
        }
      }
    }),
  )
}
