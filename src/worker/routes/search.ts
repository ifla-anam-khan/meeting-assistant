import { Hono } from 'hono'
import { eq, and, or, ilike } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { sessions, tasks, contacts, rememberItems } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

// GET /api/search?q=&space=
app.get('/', async (c) => {
  const q = c.req.query('q')?.trim()
  const space = c.req.query('space')

  if (!q || q.length < 2) {
    return c.json({ error: 'q must be at least 2 characters' }, 400)
  }
  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)
  const pattern = `%${q}%`

  const [matchedSessions, matchedTasks, matchedContacts, matchedMemory] = await Promise.all([
    db
      .select({
        id: sessions.id,
        name: sessions.name,
        summary: sessions.summary,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.space, space),
          or(ilike(sessions.name, pattern), ilike(sessions.rawTranscript, pattern)),
        ),
      )
      .limit(10),

    db
      .select({
        id: tasks.id,
        text: tasks.text,
        priority: tasks.priority,
        status: tasks.status,
        dueDate: tasks.dueDate,
        sessionId: tasks.sessionId,
      })
      .from(tasks)
      .where(and(eq(tasks.space, space), ilike(tasks.text, pattern)))
      .limit(15),

    space === 'work'
      ? db
          .select({ id: contacts.id, name: contacts.name, topic: contacts.topic, sessionId: contacts.sessionId })
          .from(contacts)
          .where(and(eq(contacts.space, 'work'), or(ilike(contacts.name, pattern), ilike(contacts.topic, pattern))))
          .limit(10)
      : Promise.resolve([]),

    db
      .select({ id: rememberItems.id, text: rememberItems.text, type: rememberItems.type, sessionId: rememberItems.sessionId })
      .from(rememberItems)
      .where(and(eq(rememberItems.space, space), ilike(rememberItems.text, pattern)))
      .limit(10),
  ])

  return c.json({
    sessions: matchedSessions.map((s) => ({ ...s, type: 'session' })),
    tasks: matchedTasks.map((t) => ({ ...t, type: 'task' })),
    contacts: matchedContacts.map((c) => ({ ...c, type: 'contact' })),
    memory: matchedMemory,
  })
})

export default app
