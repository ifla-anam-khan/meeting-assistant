import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { sessions, tasks, rememberItems, contacts } from '../db/schema'
import { extractWorkMeeting, extractPersonalDump } from '../services/extraction'
import { writeLog } from '../services/logger'

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

// Shared extraction logic — used by POST (background) and retry (foreground)
async function runExtraction(
  db: ReturnType<typeof createDb>,
  session: { id: string; space: string; name: string },
  transcript: string,
  openaiKey: string,
  originalName?: string,
): Promise<void> {
  const t0 = Date.now()
  const space = session.space as 'work' | 'personal'
  let sessionName = originalName ?? (session.name !== 'Untitled' ? session.name : '')
  let summary: string | null = null

  try {
    if (space === 'work') {
      const prevOpenQuestions = await fetchOpenQuestions(db, 'work')
      const tExtract = Date.now()
      const extraction = await extractWorkMeeting(transcript, openaiKey, prevOpenQuestions)
      const extractElapsed = Date.now() - tExtract

      summary = extraction.summary
      sessionName = originalName || extraction.title

      void writeLog(db, 'info', 'captures/extract',
        `Work extraction done in ${extractElapsed}ms: title="${extraction.title}", ` +
        `${extraction.action_items.length} tasks, ${extraction.decisions.length} decisions, ` +
        `${extraction.contacts.length} contacts, ${extraction.open_questions.length} open questions`)

      if (extraction.action_items.length > 0) {
        await db.insert(tasks).values(
          extraction.action_items.map((item) => ({
            space, sessionId: session.id, text: item.text,
            assignedBy: item.assigned_by ?? null, dueDate: item.due_date ?? null,
            priority: item.priority ?? 'normal', sourceQuote: item.source_quote ?? null,
          })),
        )
      }
      const remItems = [
        ...extraction.decisions.map((d) => ({
          sessionId: session.id, space, type: 'decision' as const,
          text: d.text, sourceQuote: d.source_quote ?? null,
        })),
        ...extraction.open_questions.map((q) => ({
          sessionId: session.id, space, type: 'open-question' as const,
          text: q.text, sourceQuote: q.source_quote ?? null,
        })),
      ]
      if (remItems.length > 0) await db.insert(rememberItems).values(remItems)
      if (extraction.contacts.length > 0) {
        await db.insert(contacts).values(
          extraction.contacts.map((ct) => ({
            sessionId: session.id, space, name: ct.name,
            topic: ct.topic, notes: ct.notes ?? null, sourceQuote: ct.source_quote ?? null,
          })),
        )
      }
    } else {
      const tExtract = Date.now()
      const extraction = await extractPersonalDump(transcript, openaiKey)
      const extractElapsed = Date.now() - tExtract
      summary = extraction.summary
      void writeLog(db, 'info', 'captures/extract',
        `Personal extraction done in ${extractElapsed}ms: ${extraction.tasks.length} tasks`)
      if (extraction.tasks.length > 0) {
        await db.insert(tasks).values(
          extraction.tasks.map((t) => ({
            space, sessionId: session.id, text: t.text,
            priority: t.priority ?? 'normal', recurrence: t.recurrence ?? 'none',
            sourceQuote: t.source_quote ?? null,
          })),
        )
      }
    }

    await db.update(sessions)
      .set({ name: sessionName || 'Untitled', summary, status: 'done' })
      .where(eq(sessions.id, session.id))
    void writeLog(db, 'info', 'captures/create',
      `Capture complete: id=${session.id}, total=${Date.now() - t0}ms, status=done`)
  } catch (err) {
    await db.update(sessions).set({ status: 'failed' }).where(eq(sessions.id, session.id))
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[captures/extract] Extraction failed for session ${session.id}: ${msg}`, stack)
    await writeLog(db, 'error', 'captures/extract',
      `Extraction failed for session ${session.id} after ${Date.now() - t0}ms: ${msg}`, stack)
    throw err
  }
}

// POST /api/captures — create session immediately, extract in background
app.post('/', zValidator('json', CreateCaptureSchema), async (c) => {
  const { space, transcript, name } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)
  const sessionType = space === 'work' ? 'meeting' : 'braindump'

  void writeLog(db, 'info', 'captures/create',
    `New ${sessionType} capture: space=${space}, transcript=${transcript.length} chars${name ? `, name="${name}"` : ''}`)

  const [session] = await db.insert(sessions).values({
    space, type: sessionType,
    name: name || 'Untitled',
    rawTranscript: transcript,
    status: 'processing',
  }).returning()

  if (!session) {
    void writeLog(db, 'error', 'captures/create', 'DB insert for new session returned no row')
    return c.json({ error: 'Failed to create capture' }, 500)
  }

  void writeLog(db, 'info', 'captures/create', `Session created: id=${session.id}, starting AI extraction`)

  // Run extraction in background — client is NOT waiting for this.
  // This makes the capture survive network drops and app backgrounding on mobile.
  c.executionCtx.waitUntil(
    runExtraction(db, session, transcript, c.env.OPENAI_API_KEY, name).catch(() => {}),
  )

  return c.json({ session }, 202)
})

// POST /api/captures/:id/retry — re-run extraction in background on a failed capture
app.post('/:id/retry', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DATABASE_URL)

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id))
  if (!session) return c.json({ error: 'Not found' }, 404)
  if (session.status !== 'failed') return c.json({ error: 'Only failed captures can be retried' }, 400)
  if (!session.rawTranscript) return c.json({ error: 'No transcript to re-process' }, 400)

  void writeLog(db, 'info', 'captures/retry',
    `Retrying extraction for session ${id} (space=${session.space}, transcript=${session.rawTranscript.length} chars)`)

  // Clear old results and set back to processing
  await db.update(sessions).set({ status: 'processing' }).where(eq(sessions.id, id))
  await db.delete(tasks).where(eq(tasks.sessionId, id))
  await db.delete(rememberItems).where(eq(rememberItems.sessionId, id))
  await db.delete(contacts).where(eq(contacts.sessionId, id))

  c.executionCtx.waitUntil(
    runExtraction(db, session, session.rawTranscript, c.env.OPENAI_API_KEY).catch(() => {}),
  )

  const [updated] = await db.select().from(sessions).where(eq(sessions.id, id))
  return c.json({ session: updated })
})

// PATCH /api/captures/:id — rename
app.patch('/:id', zValidator('json', z.object({ name: z.string().min(1) })), async (c) => {
  const id = c.req.param('id')
  const { name } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)
  const [updated] = await db.update(sessions).set({ name }).where(eq(sessions.id, id)).returning()
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

// DELETE /api/captures/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DATABASE_URL)
  await db.delete(tasks).where(eq(tasks.sessionId, id))
  await db.delete(rememberItems).where(eq(rememberItems.sessionId, id))
  await db.delete(contacts).where(eq(contacts.sessionId, id))
  const [deleted] = await db.delete(sessions).where(eq(sessions.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// GET /api/captures?space=
app.get('/', async (c) => {
  const space = c.req.query('space')
  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }
  const db = createDb(c.env.DATABASE_URL)
  const rows = await db.select({
    id: sessions.id, space: sessions.space, type: sessions.type,
    name: sessions.name, summary: sessions.summary, status: sessions.status,
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
  if (!session) return c.json({ error: 'Not found' }, 404)
  const [sessionTasks, sessionRemember, sessionContacts] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.sessionId, id)).orderBy(tasks.createdAt),
    db.select().from(rememberItems).where(eq(rememberItems.sessionId, id)).orderBy(rememberItems.createdAt),
    db.select().from(contacts).where(and(eq(contacts.sessionId, id))).orderBy(contacts.createdAt),
  ])
  return c.json({ session, tasks: sessionTasks, rememberItems: sessionRemember, contacts: sessionContacts })
})

export default app
