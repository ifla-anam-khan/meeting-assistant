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

// DELETE /api/remember/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DATABASE_URL)
  const [deleted] = await db.delete(rememberItems).where(eq(rememberItems.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.body(null, 204)
})

export default app
