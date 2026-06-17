import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { projects } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

const CreateProjectSchema = z.object({
  space: z.enum(['work', 'personal']),
  name: z.string().min(1),
  notes: z.string().optional(),
})

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'done']).optional(),
})

// GET /api/projects?space=
app.get('/', async (c) => {
  const space = c.req.query('space')
  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.space, space))
    .orderBy(desc(projects.createdAt))

  return c.json(rows)
})

// POST /api/projects
app.post('/', zValidator('json', CreateProjectSchema), async (c) => {
  const body = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  const [project] = await db
    .insert(projects)
    .values({
      space: body.space,
      name: body.name,
      notes: body.notes ?? null,
    })
    .returning()

  return c.json(project, 201)
})

// PATCH /api/projects/:id
app.patch('/:id', zValidator('json', UpdateProjectSchema), async (c) => {
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.status !== undefined) updates.status = body.status

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(eq(projects.id, id))
    .returning()

  if (!updated) return c.json({ error: 'Not found' }, 404)

  return c.json(updated)
})

// DELETE /api/projects/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DATABASE_URL)

  const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)

  return c.body(null, 204)
})

export default app
