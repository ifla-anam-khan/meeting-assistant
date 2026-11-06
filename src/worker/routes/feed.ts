import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { streamSSE } from 'hono/streaming'
import { eq, and, desc, ilike, or, gte } from 'drizzle-orm'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { feedSources, feedItems } from '../db/schema'
import { writeLog } from '../services/logger'
import { ensureSourcesSeeded } from '../services/feedSources'
import { ingestSources, deepBackfillHistorical } from '../services/feedIngestion'
import { processItems, cosineSimilarity, embedQuery } from '../services/feedProcessor'

const app = new Hono<{ Bindings: Env }>()

// ── GET /api/feed — list items ────────────────────────────────────────────────

const FeedQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
  minImportance: z.coerce.number().min(0).max(1).optional(),
  since: z.string().optional(), // ISO date
})

app.get('/', zValidator('query', FeedQuerySchema), async (c) => {
  const { category, q, limit, offset, minImportance, since } = c.req.valid('query')
  const db = createDb(c.env.DATABASE_URL)

  const conditions = []
  if (category && category !== 'all') conditions.push(eq(feedItems.category, category))
  if (minImportance != null) conditions.push(gte(feedItems.importance, minImportance))
  if (since) {
    const sinceDate = new Date(since)
    if (!isNaN(sinceDate.getTime())) conditions.push(gte(feedItems.publishedAt, sinceDate))
  }
  if (q) {
    const kws = q.toLowerCase().split(/\W+/).filter((w) => w.length >= 3).slice(0, 5)
    if (kws.length > 0) {
      conditions.push(
        or(...kws.map((kw) => or(
          ilike(feedItems.title, `%${kw}%`),
          ilike(feedItems.summary, `%${kw}%`),
          ilike(feedItems.tags, `%${kw}%`),
        )!))!,
      )
    }
  }

  const rows = await db
    .select({
      id: feedItems.id,
      url: feedItems.url,
      title: feedItems.title,
      summary: feedItems.summary,
      category: feedItems.category,
      tags: feedItems.tags,
      importance: feedItems.importance,
      publishedAt: feedItems.publishedAt,
      author: feedItems.author,
      sourceId: feedItems.sourceId,
      extra: feedItems.extra,
    })
    .from(feedItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(feedItems.importance), desc(feedItems.publishedAt))
    .limit(limit)
    .offset(offset)

  const items = rows.map((r) => ({
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : [],
  }))

  return c.json({ items, offset, limit })
})

// ── GET /api/feed/sources ─────────────────────────────────────────────────────

app.get('/sources', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  await ensureSourcesSeeded(db)
  const sources = await db
    .select()
    .from(feedSources)
    .orderBy(desc(feedSources.priority), feedSources.name)
  return c.json({ sources })
})

// ── PATCH /api/feed/sources/:id ───────────────────────────────────────────────

app.patch(
  '/sources/:id',
  zValidator('json', z.object({
    enabled: z.boolean().optional(),
    priority: z.number().int().min(1).max(3).optional(),
  })),
  async (c) => {
    const id = c.req.param('id')
    const updates = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    await db.update(feedSources).set(updates).where(eq(feedSources.id, id))
    return c.json({ ok: true })
  },
)

// ── POST /api/feed/refresh — ingest recent items in background ───────────────

app.post('/refresh', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  await ensureSourcesSeeded(db)
  void writeLog(db, 'info', 'feed/refresh', 'Manual refresh triggered — running in background')

  c.executionCtx.waitUntil(
    (async () => {
      const inserted = await ingestSources(db, {
        daysBack: 3,
        redditClientId: c.env.REDDIT_CLIENT_ID,
        redditClientSecret: c.env.REDDIT_CLIENT_SECRET,
      })
      const processed = await processItems(db, c.env.OPENAI_API_KEY, 100)
      void writeLog(db, 'info', 'feed/refresh', `Refresh done: +${inserted} items, ${processed} processed`)
    })(),
  )

  return c.json({ ok: true, message: 'Refresh started — check /logs for progress' })
})

// ── POST /api/feed/backfill — seed 90 days, runs entirely in background ──────

app.post('/backfill', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  await ensureSourcesSeeded(db)
  void writeLog(db, 'info', 'feed/backfill', '90-day backfill triggered — running in background')

  c.executionCtx.waitUntil(
    (async () => {
      // Ingest only — processing happens via the next cron run (or call /refresh after)
      const inserted = await ingestSources(db, {
        daysBack: 90,
        maxPerSource: 200,
        redditClientId: c.env.REDDIT_CLIENT_ID,
        redditClientSecret: c.env.REDDIT_CLIENT_SECRET,
      })
      void writeLog(db, 'info', 'feed/backfill', `Backfill ingestion done: ${inserted} new items. Processing starts next cron run.`)
    })(),
  )

  return c.json({ ok: true, message: 'Backfill started in background — check /logs for progress. Processing runs on next hourly cron.' })
})

// ── POST /api/feed/deep-backfill — fetch 2 years of arXiv + HN ───────────────

app.post('/deep-backfill', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  await ensureSourcesSeeded(db)
  void writeLog(db, 'info', 'feed/deep-backfill', '2-year deep backfill triggered — running in background')

  c.executionCtx.waitUntil(
    deepBackfillHistorical(db, 2).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'feed/deep-backfill', `Failed: ${msg}`)
    }),
  )

  return c.json({
    ok: true,
    message: 'Deep backfill started. Fetching 2 years of arXiv papers (quarterly) and HN discussions. ' +
      'New items appear in the feed as cron runs process them (up to 50 per hour).',
  })
})

// ── POST /api/feed/ask — semantic RAG chat ───────────────────────────────────

const AskSchema = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional().default([]),
  category: z.string().optional(),
})

app.post('/ask', zValidator('json', AskSchema), async (c) => {
  const { question, history, category } = c.req.valid('json')
  const db = createDb(c.env.DATABASE_URL)

  // 1. Keyword pre-filter: up to 200 candidate items
  const kws = question.toLowerCase().split(/\W+/).filter((w) => w.length >= 3).slice(0, 5)

  const conditions = []
  if (category && category !== 'all') conditions.push(eq(feedItems.category, category))
  if (kws.length > 0) {
    conditions.push(
      or(...kws.map((kw) => or(
        ilike(feedItems.title, `%${kw}%`),
        ilike(feedItems.summary, `%${kw}%`),
        ilike(feedItems.tags, `%${kw}%`),
      )!))!,
    )
  }

  const candidates = await db
    .select({
      id: feedItems.id,
      title: feedItems.title,
      summary: feedItems.summary,
      url: feedItems.url,
      category: feedItems.category,
      importance: feedItems.importance,
      publishedAt: feedItems.publishedAt,
      embedding: feedItems.embedding,
      author: feedItems.author,
    })
    .from(feedItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(feedItems.importance), desc(feedItems.publishedAt))
    .limit(200)

  // 2. Semantic re-rank if embeddings exist
  let ranked = candidates
  const itemsWithEmbeddings = candidates.filter((c) => c.embedding)
  if (itemsWithEmbeddings.length > 0) {
    try {
      const queryVec = await embedQuery(c.env.OPENAI_API_KEY, question)
      if (queryVec.length > 0) {
        const scored = candidates.map((item) => {
          let simScore = 0
          if (item.embedding) {
            const vec = JSON.parse(item.embedding) as number[]
            simScore = cosineSimilarity(queryVec, vec)
          }
          return { item, score: simScore * 0.7 + (item.importance ?? 0.5) * 0.3 }
        })
        scored.sort((a, b) => b.score - a.score)
        ranked = scored.map((s) => s.item)
      }
    } catch {
      // Fall back to keyword rank if embedding fails
    }
  }

  const top20 = ranked.slice(0, 20)

  // 3. Build context
  const contextLines = top20.map((item) => {
    const date = item.publishedAt.toISOString().split('T')[0]
    return `[${date}] ${item.title}\nURL: ${item.url}\n${item.summary ?? ''}`
  })
  const context = contextLines.length > 0 ? contextLines.join('\n\n') : 'No matching articles found.'

  const openai = createOpenAI({ apiKey: c.env.OPENAI_API_KEY })
  const model = openai('gpt-4o')

  const systemPrompt = `You are an AI news assistant helping an AI engineer stay current. Answer only from the articles below.

Rules:
- Write in plain English. If you use a technical term, explain it in simple words right after.
- ALWAYS cite your sources inline. Format: [Article Title](URL) — date. Every fact needs a citation.
- Use bullet points when listing multiple things.
- Keep answers short and clear — under 150 words unless the question needs more.
- If the articles don't contain the answer, say "I don't have that in the current feed" — never guess.

--- Articles in the feed ---
${context}`

  return streamSSE(c, async (stream) => {
    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: [
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: question },
        ],
      })
      for await (const chunk of result.textStream) {
        await stream.writeSSE({ data: chunk })
      }
      await stream.writeSSE({ data: '[DONE]' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'feed/ask', `OpenAI streaming error: ${msg}`)
      await stream.writeSSE({ data: '[DONE]' })
    }
  })
})

export default app
