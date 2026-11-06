import { Hono } from 'hono'
import { desc, gte, and, eq } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { appLogs } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

// GET /api/logs?days=10&level=error
app.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const days = Math.min(parseInt(c.req.query('days') ?? '10', 10), 30)
  const level = c.req.query('level') // optional filter

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select()
    .from(appLogs)
    .where(
      level
        ? and(gte(appLogs.createdAt, cutoff), eq(appLogs.level, level))
        : gte(appLogs.createdAt, cutoff),
    )
    .orderBy(desc(appLogs.createdAt))
    .limit(500)

  return c.json(rows)
})

// DELETE /api/logs — clear all logs
app.delete('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  await db.delete(appLogs)
  return c.json({ ok: true })
})

export default app
