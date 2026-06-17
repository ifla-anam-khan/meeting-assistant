import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { rememberItems } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

// GET /api/remember?space=
app.get('/', async (c) => {
  const space = c.req.query('space')
  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)
  const rows = await db.select()
    .from(rememberItems)
    .where(eq(rememberItems.space, space))
    .orderBy(desc(rememberItems.createdAt))

  return c.json(rows)
})

export default app
