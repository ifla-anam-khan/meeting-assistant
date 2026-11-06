import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { streamSSE } from 'hono/streaming'
import { eq, and, desc, ilike, or } from 'drizzle-orm'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { sessions, tasks, rememberItems, contacts } from '../db/schema'
import { writeLog } from '../services/logger'
import { anonymizeNames } from '../services/nameAnonymizer'

const app = new Hono<{ Bindings: Env }>()

const AskSchema = z.object({
  question: z.string().min(1).max(2000),
  space: z.enum(['work', 'personal']),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional().default([]),
})

// POST /api/ask — streaming AI chat over the user's data
app.post('/', zValidator('json', AskSchema), async (c) => {
  const { question, space, history } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  // SQL/keyword filter: extract potential keywords (words ≥3 chars)
  const keywords = question
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3)
    .slice(0, 5)

  // Fetch relevant content: recent sessions + keyword-matched items
  const [recentSessions, keyTasks, keyRemember, keyContacts] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.space, space))
      .orderBy(desc(sessions.createdAt))
      .limit(10),

    keywords.length > 0
      ? db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.space, space),
              or(...keywords.map((kw) => ilike(tasks.text, `%${kw}%`))),
            ),
          )
          .limit(20)
      : db.select().from(tasks).where(eq(tasks.space, space)).orderBy(desc(tasks.createdAt)).limit(20),

    keywords.length > 0
      ? db
          .select()
          .from(rememberItems)
          .where(
            and(
              eq(rememberItems.space, space),
              or(...keywords.map((kw) => ilike(rememberItems.text, `%${kw}%`))),
            ),
          )
          .limit(15)
      : Promise.resolve([]),

    space === 'work' && keywords.length > 0
      ? db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.space, 'work'),
              or(...keywords.map((kw) => ilike(contacts.name, `%${kw}%`))),
            ),
          )
          .limit(10)
      : Promise.resolve([]),
  ])

  // Build context string from fetched data
  const contextParts: string[] = []

  if (recentSessions.length > 0) {
    contextParts.push('--- Recent sessions ---')
    for (const s of recentSessions) {
      contextParts.push(
        `[${s.type === 'meeting' ? 'Meeting' : 'Brain dump'}: "${anonymizeNames(s.name ?? '')}" on ${s.createdAt.toISOString().split('T')[0]}]` +
        (s.summary ? `\nSummary: ${anonymizeNames(s.summary)}` : '') +
        `\nTranscript excerpt: ${anonymizeNames(s.rawTranscript.slice(0, 400))}${s.rawTranscript.length > 400 ? '…' : ''}`,
      )
    }
  }

  if (keyTasks.length > 0) {
    contextParts.push('--- Tasks ---')
    for (const t of keyTasks) {
      contextParts.push(
        `• [${t.status}] ${t.text}${t.dueDate ? ` (due ${t.dueDate})` : ''}${t.priority === 'high' ? ' [HIGH]' : ''}`,
      )
    }
  }

  if (keyRemember.length > 0) {
    contextParts.push('--- Decisions / key info ---')
    for (const r of keyRemember) {
      contextParts.push(`• [${r.type}] ${r.text}`)
    }
  }

  if (keyContacts.length > 0) {
    contextParts.push('--- Contacts ---')
    for (const ct of keyContacts) {
      contextParts.push(`• ${ct.name} — ${ct.topic}`)
    }
  }

  const context = contextParts.length > 0 ? contextParts.join('\n') : 'No matching data found.'

  const openai = createOpenAI({ apiKey: c.env.OPENAI_API_KEY })
  const model = openai.chat('gpt-4o')

  const systemPrompt = `You are a personal assistant helping the user recall information from their ${space} ${space === 'work' ? 'meetings and tasks' : 'tasks, projects, and plans'}.
Answer based ONLY on the data provided below. If the data doesn't contain the answer, say so honestly.
Be concise. When citing specific information, mention which meeting or date it came from.

--- Data ---
${context}`

  return streamSSE(c, async (stream) => {
    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: [
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: anonymizeNames(m.content) })),
          { role: 'user', content: anonymizeNames(question) },
        ],
      })

      for await (const chunk of result.textStream) {
        await stream.writeSSE({ data: chunk })
      }
      await stream.writeSSE({ data: '[DONE]' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'ask', `OpenAI streaming error: ${msg}`, err instanceof Error ? err.stack : undefined)
      await stream.writeSSE({ data: '[DONE]' })
    }
  })
})

export default app
