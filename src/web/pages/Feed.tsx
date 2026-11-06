import { useState, useRef, useEffect, useCallback } from 'react'
import {
  SendIcon,
  XIcon,
  MessageSquareIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  StarIcon,
  CheckIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, getToken } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string
  url: string
  title: string
  summary: string | null
  category: string
  tags: string[]
  importance: number
  publishedAt: string
  author: string | null
  sourceId: string
  extra: Record<string, unknown> | null
}

interface AskMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'papers', label: 'Papers' },
  { id: 'labs', label: 'Labs' },
  { id: 'tools', label: 'Tools' },
  { id: 'news', label: 'News' },
  { id: 'community', label: 'Community' },
]

type ImportanceFilter = 'all' | 'must-see' | 'notable'
const IMPORTANCE_FILTERS: { id: ImportanceFilter; label: string; min?: number }[] = [
  { id: 'all', label: 'All' },
  { id: 'must-see', label: '🔥 Must See', min: 0.75 },
  { id: 'notable', label: '⭐ Notable', min: 0.6 },
]

const SOURCE_NAMES: Record<string, string> = {
  'openai-blog': 'OpenAI',
  'anthropic-claude-code': 'Anthropic',
  'deepmind-blog': 'DeepMind',
  'meta-engineering': 'Meta AI',
  'mistral-blog': 'Mistral AI',
  'qwen-releases': 'Qwen',
  'deepseek-releases': 'DeepSeek',
  'google-research': 'Google Research',
  'msft-research': 'Microsoft Research',
  'hf-blog': 'HuggingFace',
  'arxiv-cs-lg': 'arXiv ML',
  'arxiv-cs-cl': 'arXiv NLP',
  'arxiv-cs-cv': 'arXiv CV',
  'arxiv-cs-ai': 'arXiv AI',
  'mcp-blog': 'MCP Blog',
  'langgraph-releases': 'LangGraph',
  'llamaindex-blog': 'LlamaIndex',
  'unsloth-blog': 'Unsloth',
  'vllm-releases': 'vLLM',
  'ollama-releases': 'Ollama',
  'llamacpp-releases': 'llama.cpp',
  'cohere-releases': 'Cohere',
  'wandb-blog': 'W&B',
  'the-decoder': 'The Decoder',
  'simon-willison': 'Simon Willison',
  'sebastian-raschka': 'Sebastian Raschka',
  'chip-huyen': 'Chip Huyen',
  'bair-blog': 'BAIR',
  'hn-llm': 'Hacker News',
  'hn-agents': 'Hacker News',
  'devto-llm': 'Dev.to',
  'devto-ai-agents': 'Dev.to',
  'github-viral-ai': 'GitHub Trending',
  'github-awesome-ai': 'GitHub Awesome',
  'reddit-localllama': 'r/LocalLLaMA',
  'reddit-ml': 'r/MachineLearning',
}

// ── Read-state helpers ────────────────────────────────────────────────────────

function loadReadSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('feed-read') ?? '[]') as string[]) }
  catch { return new Set() }
}

function saveReadSet(s: Set<string>) {
  try { localStorage.setItem('feed-read', JSON.stringify([...s].slice(-2000))) }
  catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

function importanceBorderClass(v: number) {
  if (v >= 0.75) return 'border-l-red-500'
  if (v >= 0.6) return 'border-l-amber-400'
  if (v >= 0.45) return 'border-l-violet-400/50'
  return 'border-l-transparent'
}

// ── Three-dot chat loader ─────────────────────────────────────────────────────

function ThreeDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g
  let lastIndex = 0
  let i = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[2]) {
      parts.push(<strong key={`${baseKey}-b${i++}`}>{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={`${baseKey}-i${i++}`}>{match[3]}</em>)
    } else if (match[4]) {
      parts.push(
        <code key={`${baseKey}-c${i++}`} className="text-[11px] bg-muted px-1 py-0.5 rounded font-mono">
          {match[4]}
        </code>,
      )
    } else if (match[5] && match[6]) {
      parts.push(
        <a
          key={`${baseKey}-l${i++}`}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-600 dark:text-violet-400 underline underline-offset-2 break-words"
        >
          {match[5]}
        </a>,
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let k = 0

  const flushList = () => {
    if (!listItems.length) return
    elements.push(
      listType === 'ul'
        ? <ul key={k++} className="list-disc list-outside ml-4 space-y-0.5 my-1">{listItems}</ul>
        : <ol key={k++} className="list-decimal list-outside ml-4 space-y-0.5 my-1">{listItems}</ol>,
    )
    listItems = []
    listType = null
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushList(); continue }

    if (/^#{1,3} /.test(t)) {
      flushList()
      const text = t.replace(/^#{1,3} /, '')
      elements.push(<p key={k++} className="font-semibold text-sm mt-2 mb-0.5">{renderInline(text, `h${k}`)}</p>)
      continue
    }
    if (/^[-*+] /.test(t)) {
      if (listType !== 'ul') { flushList(); listType = 'ul' }
      listItems.push(<li key={k++} className="text-sm leading-relaxed">{renderInline(t.slice(2), `li${k}`)}</li>)
      continue
    }
    if (/^\d+\. /.test(t)) {
      if (listType !== 'ol') { flushList(); listType = 'ol' }
      listItems.push(<li key={k++} className="text-sm leading-relaxed">{renderInline(t.replace(/^\d+\. /, ''), `li${k}`)}</li>)
      continue
    }
    flushList()
    elements.push(<p key={k++} className="text-sm leading-relaxed">{renderInline(t, `p${k}`)}</p>)
  }

  flushList()
  return <div className="space-y-1.5">{elements}</div>
}

// ── Backfill button ───────────────────────────────────────────────────────────

function BackfillButton({ onDone, compact = false }: { onDone: () => void; compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'started-quick' | 'started-deep' | 'error'>('idle')

  const trigger = async (endpoint: string, isDeep: boolean) => {
    setStatus(isDeep ? 'started-deep' : 'started-quick')
    try { await apiPost(endpoint, {}); onDone() }
    catch { setStatus('error') }
  }

  if (status === 'started-quick' || status === 'started-deep') {
    const isDeep = status === 'started-deep'
    return (
      <div className={cn('text-xs bg-muted/60 rounded-lg px-3 py-2 space-y-1', compact ? '' : 'mt-4 max-w-xs mx-auto')}>
        <p className="font-medium text-foreground">{isDeep ? '2-year backfill running…' : '90-day backfill running…'}</p>
        <p className="text-muted-foreground leading-relaxed">
          {isDeep
            ? 'Fetching arXiv papers (quarterly) + HN. Items appear as hourly cron processes them.'
            : 'Fetching 90 days of AI news. Items appear after the next cron run.'}
        </p>
        <button onClick={onDone} className="text-violet-600 underline">Dismiss</button>
      </div>
    )
  }

  if (status === 'error') return <p className="text-xs text-destructive">Backfill failed — check /logs.</p>

  if (compact) {
    return (
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void trigger('/feed/deep-backfill', true)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-violet-600 text-white active:scale-95"
        >
          Fetch 2yr history
        </button>
        <button
          onClick={() => void trigger('/feed/backfill', false)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-muted text-muted-foreground active:scale-95"
        >
          Refresh 90d
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2 items-center">
      <button
        onClick={() => void trigger('/feed/deep-backfill', true)}
        className="text-xs px-4 py-2.5 rounded-xl bg-violet-600 text-white active:scale-95 w-56"
      >
        Fetch 2 years of AI data
        <span className="block text-[10px] opacity-70 mt-0.5">arXiv papers + HN — recommended</span>
      </button>
      <button
        onClick={() => void trigger('/feed/backfill', false)}
        className="text-xs px-4 py-2 rounded-xl bg-muted text-muted-foreground active:scale-95 w-56"
      >
        Quick seed (90 days only)
      </button>
    </div>
  )
}

// ── Summary panel (expanded) ──────────────────────────────────────────────────

function SummaryPanel({ item }: { item: FeedItem }) {
  const stars = item.extra?.stars as number | undefined
  const language = item.extra?.language as string | undefined
  const fullName = item.extra?.fullName as string | undefined

  return (
    <div className="mt-2.5 pt-2.5 border-t border-border/50 space-y-2.5">
      {item.summary ? (
        <p className="text-sm text-foreground leading-relaxed">{item.summary}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Summary generating — check back after the next processing cycle.</p>
      )}

      {fullName && (stars != null || language) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {stars != null && (
            <span className="flex items-center gap-1">
              <StarIcon size={11} className="text-amber-400 fill-amber-400" />
              {stars.toLocaleString()} stars
            </span>
          )}
          {language && <span className="px-1.5 py-0.5 rounded bg-muted">{language}</span>}
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Read full article <ExternalLinkIcon size={11} />
      </a>
    </div>
  )
}

// ── Feed card ─────────────────────────────────────────────────────────────────

function FeedCard({
  item,
  isRead,
  onRead,
}: {
  item: FeedItem
  isRead: boolean
  onRead: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sourceName = SOURCE_NAMES[item.sourceId] ?? item.sourceId

  const handleToggle = () => {
    setExpanded((v) => !v)
    onRead(item.id)
  }

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRead(item.id)
  }

  const isMustSee = item.importance >= 0.75
  const isNotable = item.importance >= 0.6 && item.importance < 0.75

  return (
    <article
      className={cn(
        'border-b border-border last:border-0 border-l-[3px] cursor-pointer select-none transition-colors',
        importanceBorderClass(item.importance),
        expanded ? 'bg-muted/25' : isRead ? 'bg-transparent' : 'hover:bg-muted/15 active:bg-muted/30',
      )}
      onClick={handleToggle}
    >
      <div className="px-3 py-3">
        {/* Title row */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'block font-medium text-sm leading-snug hover:underline line-clamp-2',
            isRead ? 'text-muted-foreground' : 'text-foreground',
          )}
          onClick={handleTitleClick}
        >
          {item.title}
        </a>

        {/* One-line summary when collapsed */}
        {!expanded && item.summary && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1 leading-relaxed">
            {item.summary}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {/* Importance badge */}
          {isMustSee && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase bg-red-500/10 text-red-600 dark:text-red-400">
              Must See
            </span>
          )}
          {isNotable && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-400/10 text-amber-700 dark:text-amber-400">
              Notable
            </span>
          )}

          <span className="text-[10px] text-muted-foreground font-medium">{sourceName}</span>
          <span className="text-[10px] text-muted-foreground/40">·</span>
          <span className="text-[10px] text-muted-foreground">{relativeDate(item.publishedAt)}</span>

          {/* Tags (collapsed only) */}
          {!expanded && item.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {tag}
            </span>
          ))}

          {/* Read indicator + chevron */}
          <span className="ml-auto flex items-center gap-1 text-muted-foreground/40">
            {isRead && <CheckIcon size={10} className="text-muted-foreground/30" />}
            {expanded ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
          </span>
        </div>

        {/* Expanded panel */}
        {expanded && <SummaryPanel item={item} />}
      </div>
    </article>
  )
}

// ── Ask panel ─────────────────────────────────────────────────────────────────

function AskPanel({ category, onClose }: { category: string; onClose: () => void }) {
  const [messages, setMessages] = useState<AskMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<AskMessage[]>([])

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isStreaming) return
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    setIsStreaming(true)
    setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }])
    abortRef.current = new AbortController()

    try {
      const token = getToken()
      const res = await fetch('/api/feed/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question,
          category: category !== 'all' ? category : undefined,
          history: messagesRef.current
            .filter((m) => !m.isStreaming && m.content)
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + data }
            }
            return next
          })
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
    } finally {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, isStreaming: false }
        return next
      })
      setIsStreaming(false)
    }
  }, [isStreaming, category])

  const suggestions = [
    'What are the biggest AI releases this week?',
    'Best new open-source models right now?',
    'Any important papers on RAG or agents?',
    'What tools shipped for local AI inference?',
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">AI</span>
          </div>
          <span className="text-sm font-medium">Ask about the feed</span>
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <XIcon size={17} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] text-muted-foreground px-1 mb-2">Try asking:</p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => void sendMessage(s)}
                className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/60 transition-colors text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'user' ? (
              <div className="max-w-[82%] rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-violet-600 text-white text-sm leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div className="w-full">
                <div className="rounded-2xl rounded-tl-sm bg-muted/40 dark:bg-muted/30 border border-border/40 px-3.5 py-3">
                  {msg.content ? (
                    <>
                      <MarkdownMessage content={msg.content} />
                      {msg.isStreaming && (
                        <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-muted-foreground/60 animate-pulse align-middle mt-1" />
                      )}
                    </>
                  ) : msg.isStreaming ? (
                    <ThreeDots />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); void sendMessage(input) }}
          className="flex gap-2 items-end"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about AI news…"
            disabled={isStreaming}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={cn(
              'shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-white transition-all active:scale-95',
              input.trim() && !isStreaming ? 'bg-violet-600' : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            <SendIcon size={15} />
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Feed() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>('all')
  const [query, setQuery] = useState('')
  const [isAskOpen, setIsAskOpen] = useState(false)
  const [readItems, setReadItems] = useState<Set<string>>(loadReadSet)

  const markRead = useCallback((id: string) => {
    setReadItems((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      saveReadSet(next)
      return next
    })
  }, [])

  const minImportance = importanceFilter === 'must-see' ? 0.75 : importanceFilter === 'notable' ? 0.6 : undefined

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed', activeCategory, query, importanceFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '60' })
      if (activeCategory !== 'all') params.set('category', activeCategory)
      if (query) params.set('q', query)
      if (minImportance != null) params.set('minImportance', String(minImportance))
      return apiGet<{ items: FeedItem[] }>(`/feed?${params}`)
    },
    staleTime: 5 * 60_000,
  })

  const items = data?.items ?? []
  const unreadCount = items.filter((i) => !readItems.has(i.id)).length

  return (
    <div className="flex flex-col h-full">

      {/* ── Category tabs ── */}
      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex overflow-x-auto scrollbar-hide px-3 pt-2 pb-1.5 gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* ── Importance filter + search row ── */}
        <div className="flex items-center gap-2 px-3 pb-2">
          {/* Importance filter chips */}
          <div className="flex gap-1 shrink-0">
            {IMPORTANCE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setImportanceFilter(f.id)}
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors',
                  importanceFilter === f.id
                    ? f.id === 'must-see'
                      ? 'bg-red-500 text-white'
                      : f.id === 'notable'
                      ? 'bg-amber-500 text-white'
                      : 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 min-w-0 text-xs border border-border rounded-full px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />

          <button
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Refresh"
          >
            <RefreshCwIcon size={14} className={cn(isRefetching && 'animate-spin')} />
          </button>
        </div>

        {/* ── Seed buttons ── */}
        <div className="px-3 pb-2">
          <BackfillButton compact onDone={() => void refetch()} />
        </div>
      </div>

      {/* ── Feed list ── */}
      <div className={cn('flex flex-col min-h-0', isAskOpen ? 'flex-[0_0_50%]' : 'flex-1')}>
        {/* Unread count bar */}
        {items.length > 0 && unreadCount > 0 && (
          <div className="shrink-0 px-4 py-1.5 bg-muted/20 border-b border-border/40">
            <span className="text-[10px] text-muted-foreground">
              {unreadCount} unread · tap a card to expand, tap title to open
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <ThreeDots />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground px-6">
              <p className="text-sm font-medium text-foreground mb-1">
                {importanceFilter !== 'all' ? 'No items match this filter yet.' : 'No articles yet.'}
              </p>
              <p className="text-xs">
                {importanceFilter !== 'all'
                  ? 'Try "All" or seed more historical data below.'
                  : 'Seed historical data to get 2 years of AI news.'}
              </p>
              {importanceFilter === 'all' && <BackfillButton onDone={() => void refetch()} />}
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  isRead={readItems.has(item.id)}
                  onRead={markRead}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Ask panel ── */}
      {isAskOpen ? (
        <div className="flex-[0_0_50%] min-h-0 border-t border-border">
          <AskPanel category={activeCategory} onClose={() => setIsAskOpen(false)} />
        </div>
      ) : (
        <div className="shrink-0 border-t border-border p-3">
          <button
            onClick={() => setIsAskOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium active:scale-95 transition-transform"
          >
            <MessageSquareIcon size={15} />
            Ask AI about this feed
          </button>
        </div>
      )}
    </div>
  )
}
