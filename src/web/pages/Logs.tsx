import { useState } from 'react'
import { AlertCircleIcon, AlertTriangleIcon, InfoIcon, Trash2Icon, ChevronDownIcon, ChevronUpIcon, RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLogs, useClearLogs } from '@/lib/hooks'
import type { AppLog } from '@/lib/types'

const LEVEL_CONFIG = {
  error: { label: 'Error', icon: AlertCircleIcon, bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  warn:  { label: 'Warn',  icon: AlertTriangleIcon, bg: 'bg-orange-50 dark:bg-orange-950/20', text: 'text-orange-600', dot: 'bg-orange-500' },
  info:  { label: 'Info',  icon: InfoIcon, bg: 'bg-muted/40', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
}

function LogRow({ log }: { log: AppLog }) {
  const [open, setOpen] = useState(false)
  const cfg = LEVEL_CONFIG[log.level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info
  const Icon = cfg.icon
  const date = new Date(log.createdAt)

  return (
    <div className={cn('rounded-xl border border-border mb-2', cfg.bg)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <Icon size={16} className={cn('shrink-0 mt-0.5', cfg.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-semibold uppercase', cfg.text)}>{cfg.label}</span>
            <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">{log.source}</span>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' '}
              {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <p className="text-sm text-foreground mt-0.5 truncate">{log.message}</p>
        </div>
        {log.detail && (open ? <ChevronUpIcon size={14} className="shrink-0 mt-1 text-muted-foreground" /> : <ChevronDownIcon size={14} className="shrink-0 mt-1 text-muted-foreground" />)}
      </button>
      {open && log.detail && (
        <div className="px-4 pb-3 border-t border-border/50">
          <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-all font-mono leading-relaxed">
            {log.detail}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function Logs() {
  const [days, setDays] = useState(10)
  const [levelFilter, setLevelFilter] = useState<string>('')

  const { data: logs, isLoading, isError, refetch, isFetching } = useLogs(days, levelFilter || undefined)
  const clearLogs = useClearLogs()

  const counts = {
    error: logs?.filter((l) => l.level === 'error').length ?? 0,
    warn:  logs?.filter((l) => l.level === 'warn').length ?? 0,
    info:  logs?.filter((l) => l.level === 'info').length ?? 0,
  }

  const handleClear = () => {
    if (!window.confirm('Clear all logs? This cannot be undone.')) return
    clearLogs.mutate()
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Logs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCwIcon size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleClear}
            disabled={clearLogs.isPending || !logs?.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            <Trash2Icon size={14} />
            Clear all
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {/* Level filter */}
        {(['', 'error', 'warn', 'info'] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
              levelFilter === lvl
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-muted-foreground border-border hover:border-foreground',
            )}
          >
            {lvl === '' ? 'All' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
            {lvl !== '' && counts[lvl as keyof typeof counts] > 0 && (
              <span className="ml-1 opacity-60">{counts[lvl as keyof typeof counts]}</span>
            )}
          </button>
        ))}

        {/* Days picker */}
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto px-3 py-1.5 rounded-full text-xs border border-border bg-card text-foreground"
        >
          <option value={1}>Last 1 day</option>
          <option value={3}>Last 3 days</option>
          <option value={10}>Last 10 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {/* Summary bar */}
      {logs && logs.length > 0 && (
        <div className="flex gap-4 text-sm">
          {counts.error > 0 && <span className="text-destructive font-medium">{counts.error} error{counts.error !== 1 ? 's' : ''}</span>}
          {counts.warn > 0 && <span className="text-orange-500 font-medium">{counts.warn} warning{counts.warn !== 1 ? 's' : ''}</span>}
          {counts.info > 0 && <span className="text-muted-foreground">{counts.info} info</span>}
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading logs…</p>}
      {isError && <p className="text-sm text-destructive">Could not load logs.</p>}

      {!isLoading && !isError && logs?.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No logs in this period.</p>
        </div>
      )}

      {logs?.map((log) => <LogRow key={log.id} log={log} />)}
    </div>
  )
}
