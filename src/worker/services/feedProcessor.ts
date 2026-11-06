import type { Db } from '../db/client'
import { feedItems } from '../db/schema'
import { eq, isNull, sql, desc } from 'drizzle-orm'
import { writeLog } from './logger'

interface SummarizationResult {
  idx: number
  summary: string
  category: string
  tags: string[]
  importance: number
}

interface FeedItemRow {
  id: string
  title: string
  description: string | null
  category: string
}

async function callOpenAI(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function callEmbeddings(
  apiKey: string,
  inputs: string[],
): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: inputs,
      dimensions: 256,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI embeddings ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  return data.data.map((d) => d.embedding)
}

// ── Summarize a batch of up to 10 items ──────────────────────────────────────

async function summarizeBatch(
  items: FeedItemRow[],
  apiKey: string,
): Promise<SummarizationResult[]> {
  const VALID_CATEGORIES = ['papers', 'labs', 'chinese', 'academic', 'news', 'newsletter', 'tools', 'community', 'policy']

  const prompt = `You summarise AI news for busy engineers. Write like you're texting a smart friend — short, clear, no buzzwords.

For each article below, return a JSON array — one object per article.

Each object must have:
- "idx": integer index (0-based, matching input order)
- "summary": 2 sentences max. Sentence 1: WHAT happened (new model released, paper published, tool updated, etc.). Sentence 2: WHY it matters in practical terms — what can the reader actually do with this, or what problem does it solve? Use everyday words. If you must use a technical term, keep it but don't pile on more. For GitHub repos: say what you can build with it and how many stars show its popularity. Max 280 chars total.
- "category": best fit from [${VALID_CATEGORIES.join(', ')}]
- "tags": array of 3-6 lowercase keyword tags (e.g. ["llm", "agents", "fine-tuning"])
- "importance": float 0.0-1.0. Score from an AI engineer's perspective — how much would a practitioner REGRET missing this?
  0.85-1.0 = MUST SEE. Examples: new frontier model (GPT-4o / Claude 3 / Llama 3 / Gemini 1.5), paper that reshapes how we build AI (attention, RLHF, RAG, LoRA), major tool hitting v1.0 or a landmark release (vLLM, Ollama, llama.cpp major), MCP spec update, model beating SOTA on a key benchmark. Score 0.9+ only for once-a-year events.
  0.70-0.84 = NOTABLE. Examples: solid model update (not frontier but meaningfully better), well-cited new paper on agents/RAG/fine-tuning, new OSS tool with 500+ GitHub stars, HN thread with 200+ points on an AI topic, Ollama/vLLM minor release that adds a useful feature.
  0.45-0.69 = INTERESTING. Examples: practitioner blog post with useful tips, small model release, library update with new API, community experiment, paper that's niche but relevant.
  0.10-0.44 = LOW. Examples: minor patch release, generic tutorial, repost of old news, low-engagement community post.
  Be generous at the top: if it's from OpenAI/Anthropic/Google DeepMind/Meta/Mistral, start at 0.75 and go higher if it's a model or major announcement.

Return ONLY a valid JSON array, no markdown fences, no explanation.

Articles:
${items.map((item, idx) =>
    `[${idx}] Title: ${item.title}\nCategory hint: ${item.category}\nExcerpt: ${(item.description ?? '').slice(0, 500)}`
  ).join('\n\n')}`

  try {
    const response = await callOpenAI(apiKey, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
    }) as { choices: Array<{ message: { content: string } }> }

    const raw = response.choices[0]?.message?.content?.trim() ?? '[]'
    const parsed = JSON.parse(raw) as SummarizationResult[]
    return parsed.filter((r) => typeof r.idx === 'number' && typeof r.summary === 'string')
  } catch (err) {
    console.error('[feedProcessor] summarize error:', err)
    return []
  }
}

// ── Process unprocessed items ─────────────────────────────────────────────────

export async function processItems(db: Db, apiKey: string, limit = 50): Promise<number> {
  const unprocessed = await db
    .select({
      id: feedItems.id,
      title: feedItems.title,
      description: feedItems.description,
      category: feedItems.category,
    })
    .from(feedItems)
    .where(eq(feedItems.processed, false))
    // Newest first so fresh lab/news announcements get processed before the arXiv backfill
    .orderBy(desc(feedItems.publishedAt))
    .limit(limit)

  if (unprocessed.length === 0) {
    void writeLog(db, 'info', 'feed/processor', 'No unprocessed items — nothing to do')
    return 0
  }

  void writeLog(db, 'info', 'feed/processor', `Processing ${unprocessed.length} items: summarising + embedding`)
  const t0 = Date.now()

  // ── Step 1: Summarize in batches of 10 ───────────────────────────────────────
  const SUMM_BATCH = 10
  const summResults: SummarizationResult[] = []
  let summBatches = 0

  for (let i = 0; i < unprocessed.length; i += SUMM_BATCH) {
    const batch = unprocessed.slice(i, i + SUMM_BATCH)
    const tBatch = Date.now()
    const results = await summarizeBatch(batch, apiKey)
    summBatches++
    for (const r of results) summResults.push({ ...r, idx: i + r.idx })
    void writeLog(db, 'info', 'feed/processor',
      `Summarise batch ${summBatches}: ${batch.length} in → ${results.length} out (${Date.now() - tBatch}ms)`)
  }

  const updateMap = new Map<string, SummarizationResult>()
  for (const r of summResults) {
    const item = unprocessed[r.idx]
    if (item) updateMap.set(item.id, r)
  }

  // ── Step 2: Embed all items ───────────────────────────────────────────────────
  const EMBED_BATCH = 50
  const embedMap = new Map<string, number[]>()

  for (let i = 0; i < unprocessed.length; i += EMBED_BATCH) {
    const batch = unprocessed.slice(i, i + EMBED_BATCH)
    const inputs = batch.map((item) => {
      const summ = updateMap.get(item.id)
      return `${item.title}. ${summ?.summary ?? item.description ?? ''}`.slice(0, 2000)
    })
    const tEmbed = Date.now()
    try {
      const embeddings = await callEmbeddings(apiKey, inputs)
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j]) embedMap.set(batch[j].id, embeddings[j])
      }
      void writeLog(db, 'info', 'feed/processor',
        `Embed batch: ${batch.length} items → ${embeddings.length} vectors (${Date.now() - tEmbed}ms)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'feed/processor', `Embed batch failed: ${msg}`)
    }
  }

  // ── Step 3: Write results back to DB ──────────────────────────────────────────
  let updated = 0
  for (const item of unprocessed) {
    const summ = updateMap.get(item.id)
    const embedding = embedMap.get(item.id)
    try {
      await db.update(feedItems).set({
        summary: summ?.summary ?? null,
        category: summ?.category ?? item.category,
        tags: summ?.tags ? JSON.stringify(summ.tags) : null,
        importance: summ?.importance ?? 0.5,
        embedding: embedding ? JSON.stringify(embedding) : null,
        processed: true,
      }).where(eq(feedItems.id, item.id))
      updated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'feed/processor', `DB update failed for item ${item.id}: ${msg}`)
    }
  }

  void writeLog(db, 'info', 'feed/processor',
    `Processing complete: ${updated}/${unprocessed.length} items updated in ${Date.now() - t0}ms`)
  return updated
}

// ── Cosine similarity (pure JS, for search) ───────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// Embed a single query string for search
export async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const embeddings = await callEmbeddings(apiKey, [text.slice(0, 2000)])
  return embeddings[0] ?? []
}
