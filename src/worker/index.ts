import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { accessAuth } from './auth/access'
import capturesRouter from './routes/captures'
import tasksRouter from './routes/tasks'
import rememberRouter from './routes/remember'
import contactsRouter from './routes/contacts'
import pushRouter from './routes/push'
import settingsRouter from './routes/settings'
import searchRouter from './routes/search'
import askRouter from './routes/ask'
import exportRouter from './routes/export'
import { createDb } from './db/client'
import { buildDigest, buildDueReminders } from './services/digest'
import { sendPushToAll } from './services/push-send'

export type { Env }

const api = new Hono<{ Bindings: Env }>()

api.use('*', cors())
api.use('*', accessAuth())

api.route('/captures', capturesRouter)
api.route('/tasks', tasksRouter)
api.route('/remember', rememberRouter)
api.route('/contacts', contactsRouter)
api.route('/push', pushRouter)
api.route('/settings', settingsRouter)
api.route('/search', searchRouter)
api.route('/ask', askRouter)
api.route('/export', exportRouter)

api.get('/health', (c) => c.json({ ok: true }))

api.onError((err, c) => {
  console.error('[worker error]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

const app = new Hono<{ Bindings: Env }>()
app.route('/api', api)

// ── Scheduled handler (hourly cron) ───────────────────────────────────────

async function runScheduled(env: Env): Promise<void> {
  if (!env.DATABASE_URL || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    console.log('[cron] skipping — missing DB or VAPID config')
    return
  }

  const db = createDb(env.DATABASE_URL)
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  }

  // 1. Send daily digest (only when it matches the configured local hour)
  const digest = await buildDigest(db)
  if (digest.shouldSend && digest.payload) {
    console.log('[cron] sending daily digest')
    await sendPushToAll(db, vapid, digest.payload)
  }

  // 2. Send per-task reminder notifications
  const reminders = await buildDueReminders(db)
  for (const reminder of reminders) {
    console.log('[cron] sending reminder for task', reminder.taskId)
    await sendPushToAll(db, vapid, reminder)
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(req, env, ctx)
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env))
  },
}
