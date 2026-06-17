import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { sessions, tasks, rememberItems, contacts } from '../db/schema'
import { extractWorkMeeting, extractPersonalDump } from '../services/extraction'

async function fetchOpenQuestions(db: ReturnType<typeof createDb>, space: string): Promise<string[]> {
  const rows = await db
    .select({ text: rememberItems.text })
    .from(rememberItems)
    .where(and(eq(rememberItems.space, space), eq(rememberItems.type, 'open-question')))
    .orderBy(desc(rememberItems.createdAt))
    .limit(5)
  return rows.map((r) => r.text)
}

const app = new Hono<{ Bindings: Env }>()

const CreateCaptureSchema = z.object({
  space: z.enum(['work', 'personal']),
  transcript: z.string().min(1),
  name: z.string().optional(),
})

// POST /api/captures — extract + save
app.post('/', zValidator('json', CreateCaptureSchema), async (c) => {
  const { space, transcript, name } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  let sessionName = name ?? ''
  let summary: string | null = null

  const sessionType = space === 'work' ? 'meeting' : 'braindump'

  // Insert session first (status=processing so the client can show progress)
  const [session] = await db.insert(sessions).values({
    space,
    type: sessionType,
    name: sessionName || 'Untitled',
    rawTranscript: transcript,
    status: 'processing',
  }).returning()

  if (!session) {
    return c.json({ error: 'Failed to create capture' }, 500)
  }

  try {
    if (space === 'work') {
      // Carry-forward: include unresolved open questions in extraction context
      const prevOpenQuestions = await fetchOpenQuestions(db, 'work')
      const extraction = await extractWorkMeeting(transcript, c.env.GEMINI_API_KEY, prevOpenQuestions)

      summary = extraction.summary
      sessionName = name || extraction.title

      // Save tasks (action items)
      if (extraction.action_items.length > 0) {
        await db.insert(tasks).values(
          extraction.action_items.map((item) => ({
            space,
            sessionId: session.id,
            text: item.text,
            assignedBy: item.assigned_by ?? null,
            dueDate: item.due_date ?? null,
            priority: item.priority ?? 'normal',
            sourceQuote: item.source_quote ?? null,
          })),
        )
      }

      // Save remember items (decisions + open questions)
      const remItems = [
        ...extraction.decisions.map((d) => ({
          sessionId: session.id,
          space,
          type: 'decision' as const,
          text: d.text,
          sourceQuote: d.source_quote ?? null,
        })),
        ...extraction.open_questions.map((q) => ({
          sessionId: session.id,
          space,
          type: 'open-question' as const,
          text: q.text,
          sourceQuote: q.source_quote ?? null,
        })),
      ]
      if (remItems.length > 0) {
        await db.insert(rememberItems).values(remItems)
      }

      // Save contacts
      if (extraction.contacts.length > 0) {
        await db.insert(contacts).values(
          extraction.contacts.map((ct) => ({
            sessionId: session.id,
            space,
            name: ct.name,
            topic: ct.topic,
            notes: ct.notes ?? null,
            sourceQuote: ct.source_quote ?? null,
          })),
        )
      }
    } else {
      const extraction = await extractPersonalDump(transcript, c.env.GEMINI_API_KEY)

      summary = extraction.summary

      if (extraction.tasks.length > 0) {
        await db.insert(tasks).values(
          extraction.tasks.map((t) => ({
            space,
            sessionId: session.id,
            text: t.text,
            priority: t.priority ?? 'normal',
            recurrence: t.recurrence ?? 'none',
            sourceQuote: t.source_quote ?? null,
          })),
        )
      }
    }

    // Update session with final name + summary
    const [updated] = await db.update(sessions)
      .set({ name: sessionName || 'Untitled', summary, status: 'done' })
      .where(eq(sessions.id, session.id))
      .returning()

    return c.json({ session: updated }, 201)
  } catch (err) {
    // Mark session as failed but don't lose the transcript
    await db.update(sessions)
      .set({ status: 'failed' })
      .where(eq(sessions.id, session.id))
    console.error('[captures] extraction error:', err)
    return c.json({ error: 'Extraction failed. Transcript saved.' }, 500)
  }
})

// GET /api/captures?space=
app.get('/', async (c) => {
  const space = c.req.query('space')
  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)
  const rows = await db.select({
    id: sessions.id,
    space: sessions.space,
    type: sessions.type,
    name: sessions.name,
    summary: sessions.summary,
    status: sessions.status,
    createdAt: sessions.createdAt,
  })
    .from(sessions)
    .where(eq(sessions.space, space))
    .orderBy(desc(sessions.createdAt))

  return c.json(rows)
})

// GET /api/captures/:id
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DATABASE_URL)

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id))
  if (!session) {
    return c.json({ error: 'Not found' }, 404)
  }

  const [sessionTasks, sessionRemember, sessionContacts] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.sessionId, id)).orderBy(tasks.createdAt),
    db.select().from(rememberItems).where(eq(rememberItems.sessionId, id)).orderBy(rememberItems.createdAt),
    db.select().from(contacts).where(and(eq(contacts.sessionId, id))).orderBy(contacts.createdAt),
  ])

  return c.json({ session, tasks: sessionTasks, rememberItems: sessionRemember, contacts: sessionContacts })
})

export default app
