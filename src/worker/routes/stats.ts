import { Hono } from 'hono'
import { eq, and, lte, gte, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { tasks, sessions, projects } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

// GET /api/stats?space=
app.get('/', async (c) => {
  const space = c.req.query('space')
  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [completedRows, pendingRows, captureRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.space, space),
          eq(tasks.status, 'done'),
          gte(tasks.updatedAt, sevenDaysAgo),
        ),
      ),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.space, space), eq(tasks.status, 'pending'))),
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.space, space), gte(sessions.createdAt, sevenDaysAgo))),
  ])

  let topProject: { id: string; name: string; taskCount: number } | null = null

  if (space === 'personal') {
    const projectTaskCounts = await db
      .select({
        id: projects.id,
        name: projects.name,
        taskCount: sql<number>`count(${tasks.id})::int`,
      })
      .from(projects)
      .leftJoin(
        tasks,
        and(eq(tasks.projectId, projects.id), eq(tasks.status, 'pending')),
      )
      .where(eq(projects.space, 'personal'))
      .groupBy(projects.id, projects.name)
      .orderBy(sql`count(${tasks.id}) DESC`)
      .limit(1)

    if (projectTaskCounts.length > 0 && projectTaskCounts[0].taskCount > 0) {
      topProject = projectTaskCounts[0]
    }
  }

  return c.json({
    tasksCompletedThisWeek: completedRows.length,
    tasksPendingTotal: pendingRows.length,
    capturesThisWeek: captureRows.length,
    topProject,
  })
})

export default app
