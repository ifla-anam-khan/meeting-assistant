import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SearchIcon, FileTextIcon, CheckSquareIcon, UserIcon, Loader2Icon, BookOpenIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useSearch } from '@/lib/hooks'

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function Search() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const accentText = isWork ? 'text-indigo-600' : 'text-emerald-600'
  const accentRing = isWork ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'

  const [raw, setRaw] = useState('')
  const q = useDebounce(raw, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data, isFetching, isError } = useSearch(q, space)

  const total = (data?.sessions.length ?? 0) + (data?.tasks.length ?? 0) + (data?.contacts.length ?? 0) + (data?.memory.length ?? 0)

  return (
    <div className="flex flex-col max-w-2xl mx-auto">
      {/* Search input */}
      <div className="sticky top-0 bg-background border-b border-border px-4 py-3 z-10">
        <div className="relative">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={isWork ? 'Search meetings, tasks, contacts…' : 'Search tasks and notes…'}
            className={cn(
              'w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:bg-background',
              accentRing,
            )}
          />
          {isFetching && (
            <Loader2Icon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Empty state */}
        {q.length < 2 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}

        {isError && (
          <div className="text-sm text-destructive text-center py-4">
            Search failed. Check your connection.
          </div>
        )}

        {q.length >= 2 && !isFetching && data && total === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No results for "{q}"
          </div>
        )}

        {/* Meetings / captures */}
        {(data?.sessions.length ?? 0) > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <FileTextIcon size={12} />
              {isWork ? 'Meetings' : 'Notes'} ({data!.sessions.length})
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {data!.sessions.map((s) => (
                <Link
                  key={s.id}
                  to={`/captures/${s.id}`}
                  className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  {s.summary && (
                    <span className="text-xs text-muted-foreground line-clamp-1">{s.summary}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Tasks */}
        {(data?.tasks.length ?? 0) > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <CheckSquareIcon size={12} />
              Tasks ({data!.tasks.length})
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {data!.tasks.map((t) => (
                <Link
                  key={t.id}
                  to={t.sessionId ? `/captures/${t.sessionId}` : '/todo'}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm', t.status === 'done' && 'line-through text-muted-foreground')}>
                      {t.text}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.status === 'done' && <span className="text-xs text-muted-foreground">Done</span>}
                      {t.dueDate && <span className="text-xs text-muted-foreground">{t.dueDate}</span>}
                    </div>
                  </div>
                  {t.priority === 'high' && (
                    <span className="text-xs font-semibold text-orange-500 shrink-0">HIGH</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Memory — decisions, open questions, facts */}
        {(data?.memory.length ?? 0) > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <BookOpenIcon size={12} />
              Memory ({data!.memory.length})
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {data!.memory.map((m) => (
                <Link
                  key={m.id}
                  to={m.sessionId ? `/captures/${m.sessionId}` : '/remember'}
                  className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{m.type.replace('-', ' ')}</span>
                  <span className="text-sm text-foreground">{m.text}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Contacts (Work only) */}
        {isWork && (data?.contacts.length ?? 0) > 0 && (
          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <UserIcon size={12} />
              Contacts ({data!.contacts.length})
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {data!.contacts.map((c) => (
                <div key={c.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className={cn('text-sm font-medium', accentText)}>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.topic}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
