import { Link } from 'react-router-dom'
import { CalendarIcon, ChevronRightIcon, PlusCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useCaptures } from '@/lib/hooks'
import type { Session } from '@/lib/types'

function CaptureCard({ session, isWork }: { session: Session; isWork: boolean }) {
  const date = new Date(session.createdAt)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <Link
      to={`/captures/${session.id}`}
      className="flex items-start gap-3 px-3 py-3.5 border-b border-border last:border-0 active:bg-muted/50 transition-colors"
    >
      <div className={cn(
        'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold mt-0.5',
        isWork ? 'bg-indigo-600' : 'bg-emerald-600',
      )}>
        {isWork ? 'M' : 'D'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{session.name}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <CalendarIcon size={11} />
          <span>{dateStr} · {timeStr}</span>
        </div>
        {session.summary && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{session.summary}</p>
        )}
        {session.status === 'processing' && (
          <span className="inline-block text-xs text-muted-foreground mt-1 italic">Processing…</span>
        )}
        {session.status === 'failed' && (
          <span className="inline-block text-xs text-destructive mt-1">Extraction failed</span>
        )}
      </div>
      <ChevronRightIcon size={16} className="shrink-0 text-muted-foreground mt-1" />
    </Link>
  )
}

export default function CapturesList() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const label = isWork ? 'Meetings' : 'Brain Dumps'

  const { data: captures, isLoading, isError } = useCaptures(space)

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">{label}</h1>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load captures.</p>}

      {!isLoading && !isError && captures && captures.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-2xl">{isWork ? '📋' : '🎤'}</p>
          <p className="font-medium text-foreground">No {label.toLowerCase()} yet</p>
          <Link
            to="/capture"
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white',
              isWork ? 'bg-indigo-600' : 'bg-emerald-600',
            )}
          >
            <PlusCircleIcon size={16} />
            {isWork ? 'Capture a Meeting' : 'Start a Brain Dump'}
          </Link>
        </div>
      )}

      {captures && captures.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          {captures.map((s) => <CaptureCard key={s.id} session={s} isWork={isWork} />)}
        </div>
      )}
    </div>
  )
}
