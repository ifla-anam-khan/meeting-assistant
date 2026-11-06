import type { Db } from '../db/client'
import { feedSources, feedItems } from '../db/schema'
import { eq } from 'drizzle-orm'
import { FEED_SOURCES } from './feedSources'
import { writeLog } from './logger'

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlToId(url: string): string {
  let h1 = 0x9dc5_8c4d
  let h2 = 0x3fd7_2b8a
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i)
    h1 = (Math.imul(h1, 31) + c) | 0
    h2 = (Math.imul(h2, 37) + c) | 0
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return toHex(h1) + toHex(h2)
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = re.exec(xml)
  return m ? stripCdata(m[1]) : ''
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`, 'i')
  const m = re.exec(xml)
  return m ? m[1] : ''
}

interface RawItem {
  id: string
  sourceId: string
  url: string
  title: string
  description: string
  category: string
  publishedAt: Date
  author: string
  extra: Record<string, unknown>
}

// ── RSS / Atom parser (no DOMParser — regex based) ────────────────────────────

function parseRss(xml: string, sourceId: string, category: string): RawItem[] {
  const isAtom = /<feed[\s>]/i.test(xml)
  const entryTag = isAtom ? 'entry' : 'item'
  const entryRe = new RegExp(`<${entryTag}[\\s>]([\\s\\S]*?)<\\/${entryTag}>`, 'gi')
  const items: RawItem[] = []

  let m: RegExpExecArray | null
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1]

    const title = stripHtml(extractTag(block, 'title') || extractTag(block, 'media:title'))
    if (!title) continue

    // URL: <link> (RSS) or <link href="..."> (Atom)
    let url = ''
    const atomLink = /<link[^>]+href=["']([^"']+)["']/i.exec(block)
    if (atomLink) {
      url = atomLink[1]
    } else {
      url = stripHtml(extractTag(block, 'link'))
    }
    if (!url) continue

    const description = stripHtml(
      extractTag(block, 'content:encoded') ||
      extractTag(block, 'content') ||
      extractTag(block, 'description') ||
      extractTag(block, 'summary'),
    ).slice(0, 1000)

    const pubRaw = extractTag(block, 'pubDate') ||
      extractTag(block, 'published') ||
      extractTag(block, 'updated') ||
      extractTag(block, 'dc:date')
    const publishedAt = pubRaw ? new Date(pubRaw) : new Date()

    const author = stripHtml(
      extractTag(block, 'author') ||
      extractTag(block, 'dc:creator') ||
      extractTag(block, 'name'),
    ).slice(0, 100)

    items.push({
      id: urlToId(url),
      sourceId,
      url,
      title: title.slice(0, 500),
      description,
      category,
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      author,
      extra: {},
    })
  }

  return items
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchRssSource(source: { id: string; url: string; category: string }): Promise<RawItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'AI-Signal/1.0 (+https://github.com)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRss(xml, source.id, source.category)
  } catch {
    return []
  }
}

// arXiv Atom API — fetches up to maxResults papers, optionally from daysBack ago
async function fetchArxivSource(
  source: { id: string; url: string; category: string },
  maxResults = 50,
  daysBack?: number,
): Promise<RawItem[]> {
  try {
    let searchQuery = `cat:${source.url}`
    if (daysBack != null) {
      const from = new Date()
      from.setDate(from.getDate() - daysBack)
      const toStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const fromStr = from.toISOString().slice(0, 10).replace(/-/g, '')
      searchQuery += `+AND+submittedDate:[${fromStr}0000+TO+${toStr}2359]`
    }
    const url =
      `https://export.arxiv.org/api/query?search_query=${searchQuery}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`

    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return []
    const xml = await res.text()
    const items = parseRss(xml, source.id, source.category)

    // arXiv links from Atom look like: https://arxiv.org/abs/2501.12345
    return items.map((item) => {
      const paperId = item.url.split('/').pop() ?? ''
      return {
        ...item,
        extra: { paperId, pdfUrl: `https://arxiv.org/pdf/${paperId}` },
      }
    })
  } catch {
    return []
  }
}

async function fetchHnSource(
  source: { id: string; url: string; category: string },
  daysBack = 7,
): Promise<RawItem[]> {
  try {
    const since = Math.floor((Date.now() - daysBack * 86_400_000) / 1000)
    const query = encodeURIComponent(source.url)
    // Encode > as %3E — Algolia requires this in numericFilters
    const filters = encodeURIComponent(`points>30,created_at_i>${since}`)
    const url =
      `https://hn.algolia.com/api/v1/search?query=${query}&tags=story` +
      `&hitsPerPage=100&numericFilters=${filters}`

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return []
    const data = await res.json() as { hits: Array<{ objectID: string; title: string; url?: string; story_text?: string; author: string; points: number; num_comments: number; created_at: string }> }
    const hits = data.hits ?? []

    return hits
      .filter((h) => h.url && h.title)
      .map((h) => ({
        id: urlToId(h.url!),
        sourceId: source.id,
        url: h.url!,
        title: h.title.slice(0, 500),
        description: stripHtml(h.story_text ?? '').slice(0, 1000),
        category: source.category,
        publishedAt: new Date(h.created_at),
        author: h.author,
        extra: { points: h.points, comments: h.num_comments, hnId: h.objectID },
      }))
  } catch {
    return []
  }
}

// GitHub Search API — finds recently created / viral AI repos
async function fetchGithubSource(
  source: { id: string; url: string; category: string },
  _daysBack = 30,
): Promise<RawItem[]> {
  try {
    // Awesome lists are evergreen; viral repos use a fixed 90-day window so
    // we always capture repos that spiked in stars recently, not just today.
    const isAwesome = source.url.toLowerCase().includes('awesome')
    let query = source.url
    if (!isAwesome) {
      const since = new Date()
      since.setDate(since.getDate() - 90)
      const sinceStr = since.toISOString().slice(0, 10)
      query = `${source.url} created:>${sinceStr} stars:>30`
    }
    const q = encodeURIComponent(query)

    const apiUrl = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=40`
    const res = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-Signal/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []

    const data = await res.json() as {
      items: Array<{
        name: string; full_name: string; html_url: string; description: string | null
        stargazers_count: number; language: string | null; topics: string[]
        created_at: string; pushed_at: string; forks_count: number
      }>
    }

    return (data.items ?? []).map((repo) => {
      const stars = repo.stargazers_count
      const importance = stars >= 2000 ? 0.9 : stars >= 1000 ? 0.85 : stars >= 500 ? 0.75 : stars >= 100 ? 0.65 : 0.55
      const desc = repo.description ?? ''
      const langInfo = repo.language ? ` · ${repo.language}` : ''
      return {
        id: urlToId(repo.html_url),
        sourceId: source.id,
        url: repo.html_url,
        title: `${repo.full_name}${langInfo} ⭐ ${stars.toLocaleString()}`,
        description: `${desc}. Topics: ${repo.topics.slice(0, 6).join(', ')}`.slice(0, 1000),
        category: source.category,
        publishedAt: new Date(repo.created_at),
        author: repo.full_name.split('/')[0] ?? '',
        extra: { stars, language: repo.language, forks: repo.forks_count, fullName: repo.full_name },
      }
    })
  } catch {
    return []
  }
}

// Reddit OAuth2 — client_credentials grant (no user login needed, reads public subreddits)
async function getRedditToken(clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const credentials = btoa(`${clientId}:${clientSecret}`)
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'cloudflare-worker:ai-signal:1.0',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string }
    return data.access_token ?? null
  } catch {
    return null
  }
}

async function fetchRedditSource(
  source: { id: string; url: string; category: string },
  token: string,
): Promise<RawItem[]> {
  try {
    // oauth.reddit.com requires a Bearer token; returns same JSON as www.reddit.com
    const url = `https://oauth.reddit.com/r/${source.url}/new.json?limit=100`
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'cloudflare-worker:ai-signal:1.0',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const data = await res.json() as { data: { children: Array<{ data: { id: string; title: string; url: string; selftext: string; author: string; score: number; num_comments: number; created_utc: number; permalink: string } }> } }
    const children = data.data?.children ?? []

    return children
      .filter((c) => c.data.title && c.data.score > 5)
      .map((c) => {
        const d = c.data
        const canonUrl = d.url.startsWith('http') ? d.url : `https://reddit.com${d.permalink}`
        return {
          id: urlToId(canonUrl),
          sourceId: source.id,
          url: canonUrl,
          title: d.title.slice(0, 500),
          description: stripHtml(d.selftext ?? '').slice(0, 1000),
          category: source.category,
          publishedAt: new Date(d.created_utc * 1000),
          author: d.author,
          extra: { score: d.score, comments: d.num_comments, subreddit: source.url },
        }
      })
  } catch {
    return []
  }
}

// ── Main ingestion entry point ────────────────────────────────────────────────

export interface IngestOptions {
  /** Only process enabled sources matching this category (all if omitted) */
  category?: string
  /** For arXiv/HN: how many days back to search (default 3 for normal, 90 for backfill) */
  daysBack?: number
  /** Fetch at most this many items per source */
  maxPerSource?: number
  /** Reddit OAuth2 credentials — from reddit.com/prefs/apps (script app) */
  redditClientId?: string
  redditClientSecret?: string
}

export async function ingestSources(db: Db, options: IngestOptions = {}): Promise<number> {
  const { category, daysBack = 3, maxPerSource = 50, redditClientId, redditClientSecret } = options

  // Fetch Reddit OAuth token once upfront — shared across all Reddit sources this run
  let redditToken: string | null = null
  if (redditClientId && redditClientSecret) {
    redditToken = await getRedditToken(redditClientId, redditClientSecret)
    void writeLog(db, 'info', 'feed/ingest', redditToken ? 'Reddit OAuth token obtained' : 'Reddit OAuth token failed — Reddit sources will be skipped')
  }

  const sourcesFromDb = await db
    .select()
    .from(feedSources)
    .where(eq(feedSources.enabled, true))

  const filtered = category
    ? sourcesFromDb.filter((s) => s.category === category)
    : sourcesFromDb

  void writeLog(db, 'info', 'feed/ingest',
    `Starting ingestion: ${filtered.length} sources, daysBack=${daysBack}, maxPerSource=${maxPerSource}`)

  let totalInserted = 0

  const BATCH = 8
  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (source) => {
        const t0 = Date.now()
        let items: RawItem[] = []
        try {
          switch (source.type) {
            case 'arxiv': items = await fetchArxivSource(source, maxPerSource, daysBack); break
            case 'hn': items = await fetchHnSource(source, daysBack); break
            case 'reddit': items = redditToken ? await fetchRedditSource(source, redditToken) : []; break
            case 'github': items = await fetchGithubSource(source, Math.min(daysBack, 30)); break
            case 'rss':
            case 'hf':
            default: items = await fetchRssSource(source)
          }
          void writeLog(db, 'info', 'feed/ingest',
            `[${source.id}] fetched ${items.length} items in ${Date.now() - t0}ms`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          void writeLog(db, 'warn', 'feed/ingest', `[${source.id}] fetch failed: ${msg}`)
        }
        return items
      }),
    )

    const allItems = results
      .filter((r): r is PromiseFulfilledResult<RawItem[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)

    if (allItems.length === 0) continue

    try {
      const rows = allItems.map((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        url: item.url,
        title: item.title,
        description: item.description || null,
        category: item.category,
        publishedAt: item.publishedAt,
        author: item.author || null,
        extra: Object.keys(item.extra).length ? item.extra : null,
        importance: 0.5,
        processed: false,
      }))

      const result = await db.insert(feedItems).values(rows).onConflictDoNothing()
      totalInserted += result.rowCount ?? 0
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void writeLog(db, 'error', 'feed/ingest', `Batch DB insert failed: ${msg}`)
    }
  }

  void writeLog(db, 'info', 'feed/ingest', `Ingestion complete: ${totalInserted} new items inserted`)
  return totalInserted
}

// Backfill: seed 90 days of historical data from API-based sources.
// RSS sources are fetched normally (they don't have deep history).
export async function backfillHistorical(db: Db): Promise<number> {
  return ingestSources(db, { daysBack: 90, maxPerSource: 200 })
}

// ── Deep backfill: 2-year historical arXiv + HN ───────────────────────────────

// Helper shared by deep backfill and ingestSources
async function insertItems(db: Db, items: RawItem[]): Promise<number> {
  if (items.length === 0) return 0
  try {
    const rows = items.map((item) => ({
      id: item.id, sourceId: item.sourceId, url: item.url, title: item.title,
      description: item.description || null, category: item.category,
      publishedAt: item.publishedAt, author: item.author || null,
      extra: Object.keys(item.extra).length ? item.extra : null,
      importance: 0.5, processed: false,
    }))
    const result = await db.insert(feedItems).values(rows).onConflictDoNothing()
    return result.rowCount ?? 0
  } catch {
    return 0
  }
}

// arXiv query for a specific date range window
async function fetchArxivDateRange(
  sourceId: string,
  arxivCat: string,
  category: string,
  fromDate: Date,
  toDate: Date,
  maxResults = 150,
): Promise<RawItem[]> {
  try {
    const fromStr = fromDate.toISOString().slice(0, 10).replace(/-/g, '')
    const toStr = toDate.toISOString().slice(0, 10).replace(/-/g, '')
    const searchQuery = `cat:${arxivCat}+AND+submittedDate:[${fromStr}0000+TO+${toStr}2359]`
    const url =
      `https://export.arxiv.org/api/query?search_query=${searchQuery}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const xml = await res.text()
    const items = parseRss(xml, sourceId, category)
    return items.map((item) => {
      const paperId = item.url.split('/').pop() ?? ''
      return { ...item, extra: { paperId, pdfUrl: `https://arxiv.org/pdf/${paperId}` } }
    })
  } catch {
    return []
  }
}

/**
 * Deep historical backfill — fetches up to `yearsBack` years of data.
 * Works for: arXiv (quarterly chunks, 150 papers/quarter/category)
 *            HN (extended date window via Algolia)
 * RSS/GitHub feeds don't have deep history so they are skipped.
 * Processing (GPT summary + embeddings) happens on subsequent cron runs.
 */
export async function deepBackfillHistorical(db: Db, yearsBack = 2): Promise<number> {
  const sources = await db.select().from(feedSources).where(eq(feedSources.enabled, true))
  let totalInserted = 0
  const now = new Date()
  const totalQuarters = yearsBack * 4

  void writeLog(db, 'info', 'feed/deep-backfill',
    `Starting ${yearsBack}-year deep backfill: ${totalQuarters} quarters per arXiv source`)

  // ── arXiv: quarterly chunks ───────────────────────────────────────────────
  const arxivSources = sources.filter((s) => s.type === 'arxiv')

  for (const source of arxivSources) {
    let sourceTotal = 0
    for (let q = 0; q < totalQuarters; q++) {
      const toDate = new Date(now)
      toDate.setMonth(toDate.getMonth() - q * 3)
      const fromDate = new Date(toDate)
      fromDate.setMonth(fromDate.getMonth() - 3)

      const items = await fetchArxivDateRange(source.id, source.url, source.category, fromDate, toDate)
      const inserted = await insertItems(db, items)
      sourceTotal += inserted

      // arXiv asks for ≤3 req/s
      await new Promise((r) => setTimeout(r, 400))
    }
    void writeLog(db, 'info', 'feed/deep-backfill',
      `[${source.id}] ${totalQuarters} quarters done → ${sourceTotal} new items`)
    totalInserted += sourceTotal
  }

  // ── HN: Algolia supports arbitrary date ranges natively ──────────────────
  const hnSources = sources.filter((s) => s.type === 'hn')
  for (const source of hnSources) {
    const items = await fetchHnSource(source, yearsBack * 365)
    const inserted = await insertItems(db, items)
    void writeLog(db, 'info', 'feed/deep-backfill', `[${source.id}] ${inserted} new HN items`)
    totalInserted += inserted
  }

  void writeLog(db, 'info', 'feed/deep-backfill',
    `Deep backfill complete: ${totalInserted} new items. Summarisation runs on subsequent cron cycles.`)
  return totalInserted
}
