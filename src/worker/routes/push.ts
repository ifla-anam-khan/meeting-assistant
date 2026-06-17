import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { pushSubscriptions } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
})

// POST /api/push/subscribe — store or refresh a push subscription
app.post('/subscribe', zValidator('json', SubscribeSchema), async (c) => {
  const { endpoint, keys } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  await db
    .insert(pushSubscriptions)
    .values({ endpoint, keys })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { keys },
    })

  return c.json({ ok: true }, 201)
})

// DELETE /api/push/unsubscribe — remove a subscription
app.delete('/unsubscribe', zValidator('json', z.object({ endpoint: z.string() })), async (c) => {
  const { endpoint } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))

  return c.body(null, 204)
})

// GET /api/push/vapid-public-key — frontend needs the public key to subscribe
app.get('/vapid-public-key', (c) => {
  if (!c.env.VAPID_PUBLIC_KEY) {
    return c.json({ error: 'Push not configured' }, 503)
  }
  return c.json({ key: c.env.VAPID_PUBLIC_KEY })
})

export default app
