import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { settings } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

// GET /api/settings
app.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  let [row] = await db.select().from(settings).where(eq(settings.id, 1))
  if (!row) {
    ;[row] = await db.insert(settings).values({ id: 1 }).returning()
  }
  return c.json(row)
})

// PATCH /api/settings
app.patch(
  '/',
  zValidator(
    'json',
    z.object({
      digestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      digestEnabled: z.boolean().optional(),
      digestCombined: z.boolean().optional(),
      eveningDigestEnabled: z.boolean().optional(),
      eveningDigestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)

    // Upsert: ensure the row exists, then update
    await db.insert(settings).values({ id: 1 }).onConflictDoNothing()

    const [updated] = await db
      .update(settings)
      .set(body)
      .where(eq(settings.id, 1))
      .returning()

    return c.json(updated)
  },
)

export default app
