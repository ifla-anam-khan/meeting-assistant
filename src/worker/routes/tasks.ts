import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, asc, desc, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { tasks } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

const CreateTaskSchema = z.object({
  space: z.enum(['work', 'personal']),
  text: z.string().min(1),
  priority: z.enum(['high', 'normal']).optional().default('normal'),
  due_date: z.string().nullable().optional(),
})

const UpdateTaskSchema = z.object({
  status: z.enum(['pending', 'done']).optional(),
  text: z.string().min(1).optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['high', 'normal']).optional(),
  snoozed_until: z.string().nullable().optional(),
})

// GET /api/tasks?space=&status=
app.get('/', async (c) => {
  const space = c.req.query('space')
  const statusFilter = c.req.query('status') // 'pending' | 'done' | undefined (all)

  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)

  const filters = [eq(tasks.space, space)]
  if (statusFilter === 'pending' || statusFilter === 'done') {
    filters.push(eq(tasks.status, statusFilter))
  }

  // Sort: high priority first, then by due_date ascending (nulls last), then newest first
  const rows = await db.select().from(tasks)
    .where(and(...filters))
    .orderBy(
      sql`CASE WHEN ${tasks.priority} = 'high' THEN 0 ELSE 1 END`,
      sql`${tasks.dueDate} ASC NULLS LAST`,
      desc(tasks.createdAt),
    )

  return c.json(rows)
})

// POST /api/tasks — quick manual add
app.post('/', zValidator('json', CreateTaskSchema), async (c) => {
  const body = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  const [task] = await db.insert(tasks).values({
    space: body.space,
    text: body.text,
    priority: body.priority ?? 'normal',
    dueDate: body.due_date ?? null,
  }).returning()

  return c.json(task, 201)
})

// PATCH /api/tasks/:id
app.patch('/:id', zValidator('json', UpdateTaskSchema), async (c) => {
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  }
  if (body.status !== undefined) updates.status = body.status
  if (body.text !== undefined) updates.text = body.text
  if (body.due_date !== undefined) updates.dueDate = body.due_date
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.snoozed_until !== undefined) updates.snoozedUntil = body.snoozed_until

  const [updated] = await db.update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning()

  if (!updated) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(updated)
})

// DELETE /api/tasks/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DATABASE_URL)

  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning()
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.body(null, 204)
})

export default app
