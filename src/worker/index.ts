import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
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
import projectsRouter from './routes/projects'
import statsRouter from './routes/stats'
import transcribeRouter from './routes/transcribe'
import logsRouter from './routes/logs'
import feedRouter from './routes/feed'
import { createDb } from './db/client'
import { buildDigest, buildDueReminders } from './services/digest'
import { sendPushToAll } from './services/push-send'
import { writeLog, pruneOldLogs } from './services/logger'
import { ensureSourcesSeeded } from './services/feedSources'
import { ingestSources } from './services/feedIngestion'
import { processItems } from './services/feedProcessor'

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
api.route('/projects', projectsRouter)
api.route('/stats', statsRouter)
api.route('/transcribe', transcribeRouter)
api.route('/logs', logsRouter)
api.route('/feed', feedRouter)

api.get('/health', (c) => c.json({ ok: true }))

api.onError((err, c) => {
  console.error('[worker error]', err)
  const db = createDb(c.env.DATABASE_URL)
  void writeLog(db, 'error', 'worker', err.message || 'Unhandled error', err.stack)
  return c.json({ error: 'Internal server error' }, 500)
})

const app = new Hono<{ Bindings: Env }>()
app.route('/api', api)

// ── Scheduled handler (hourly cron) ───────────────────────────────────────

async function warmUpDb(db: ReturnType<typeof createDb>): Promise<void> {
  // Neon free tier suspends after inactivity; the first query on a cold connection often fails.
  // Run a cheap ping and retry once to wake the DB before the real cron work begins.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.execute(sql`SELECT 1`)
      return
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

async function runScheduled(env: Env): Promise<void> {
  if (!env.DATABASE_URL || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    console.log('[cron] skipping — missing DB or VAPID config')
    return
  }

  const db = createDb(env.DATABASE_URL)

  try {
    await warmUpDb(db)
  } catch {
    console.error('[cron] DB warm-up failed after 3 attempts — aborting run')
    return
  }

  const t0 = Date.now()
  void writeLog(db, 'info', 'cron', 'Scheduled run started')

  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  }

  // Prune logs older than 10 days
  await pruneOldLogs(db)

  // 1. Daily digest
  try {
    const digest = await buildDigest(db)
    if (digest.shouldSend && digest.payload) {
      void writeLog(db, 'info', 'cron/digest', `Sending digest: "${digest.payload.title}"`)
      await sendPushToAll(db, vapid, digest.payload)
    } else {
      void writeLog(db, 'info', 'cron/digest', 'No digest to send this hour')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    void writeLog(db, 'error', 'cron/digest', `Digest failed: ${msg}`, err instanceof Error ? err.stack : undefined)
  }

  // 2. Per-task reminders
  try {
    const reminders = await buildDueReminders(db)
    if (reminders.length === 0) {
      void writeLog(db, 'info', 'cron/reminders', 'No reminders due this window')
    }
    for (const reminder of reminders) {
      void writeLog(db, 'info', 'cron/reminders', `Sending reminder for task ${reminder.taskId}: "${reminder.body.slice(0, 80)}"`)
      await sendPushToAll(db, vapid, reminder)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    void writeLog(db, 'error', 'cron/reminders', `Reminders failed: ${msg}`, err instanceof Error ? err.stack : undefined)
  }

  // 3. Feed ingestion + processing
  if (env.OPENAI_API_KEY) {
    try {
      await ensureSourcesSeeded(db)
      const tFeed = Date.now()
      const inserted = await ingestSources(db, {
        daysBack: 3,
        redditClientId: env.REDDIT_CLIENT_ID,
        redditClientSecret: env.REDDIT_CLIENT_SECRET,
      })
      const processed = await processItems(db, env.OPENAI_API_KEY, 100)
      void writeLog(db, 'info', 'cron/feed',
        `Feed run in ${Date.now() - tFeed}ms: +${inserted} new items ingested, ${processed} items summarised/embedded`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'cron/feed', `Feed ingestion error: ${msg}`, err instanceof Error ? err.stack : undefined)
    }
  } else {
    void writeLog(db, 'warn', 'cron/feed', 'Skipping feed — OPENAI_API_KEY not set')
  }

  void writeLog(db, 'info', 'cron', `Scheduled run complete in ${Date.now() - t0}ms`)
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(req, env, ctx)
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env))
  },
}
