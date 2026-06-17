import { Link } from 'react-router-dom'
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleIcon,
  PlusCircleIcon,
  ChevronRightIcon,
  FileTextIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useTasks, useCaptures } from '@/lib/hooks'
import type { Task } from '@/lib/types'

function todayISO() {
  return new Date().toISOString().split('T')[0]!
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TaskRow({ task, isWork }: { task: Task; isWork: boolean }) {
  const today = todayISO()
  const isOverdue = task.dueDate && task.dueDate < today && task.status === 'pending'

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="mt-0.5 shrink-0">
        {task.status === 'done'
          ? <CheckCircle2Icon size={18} className={cn('shrink-0', isWork ? 'text-indigo-600' : 'text-emerald-600')} />
          : <CircleIcon size={18} className="text-muted-foreground shrink-0" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', task.status === 'done' && 'line-through text-muted-foreground')}>
          {task.text}
        </p>
        {task.dueDate && (
          <span className={cn(
            'inline-block text-xs mt-0.5 font-medium',
            isOverdue ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
      {task.priority === 'high' && (
        <span className="shrink-0 text-xs font-semibold text-orange-500 mt-0.5">HIGH</span>
      )}
    </div>
  )
}

export default function Home() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const accentText = isWork ? 'text-indigo-600' : 'text-emerald-600'

  const { data: allTasks, isLoading, isError } = useTasks(space, 'pending')
  const { data: recentCaptures } = useCaptures(space)
  const today = todayISO()

  const overdue = (allTasks ?? []).filter((t) => t.dueDate && t.dueDate < today)
  const dueToday = (allTasks ?? []).filter((t) => t.dueDate === today)
  const upcoming = (allTasks ?? []).filter((t) => !t.dueDate || t.dueDate > today).slice(0, 5)
  const totalPending = allTasks?.length ?? 0
  const latestCaptures = (recentCaptures ?? []).slice(0, 3)

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      {/* Date header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Today</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground text-center">
          Loading tasks…
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive text-center">
          Could not load tasks. Check your connection.
        </div>
      )}

      {/* Summary pill */}
      {!isLoading && !isError && totalPending > 0 && (
        <div className={cn('flex items-center gap-2 text-sm font-medium', accentText)}>
          <CalendarClockIcon size={16} />
          {totalPending} pending · {overdue.length} overdue · {dueToday.length} due today
        </div>
      )}

      {/* Overdue section */}
      {overdue.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-destructive mb-1">Overdue</h2>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 divide-y divide-border">
            {overdue.map((t) => <TaskRow key={t.id} task={t} isWork={isWork} />)}
          </div>
        </section>
      )}

      {/* Due today section */}
      {dueToday.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Due Today</h2>
          <div className="rounded-xl border border-border bg-card px-3 divide-y divide-border">
            {dueToday.map((t) => <TaskRow key={t.id} task={t} isWork={isWork} />)}
          </div>
        </section>
      )}

      {/* Upcoming / other tasks */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Other Tasks</h2>
          <div className="rounded-xl border border-border bg-card px-3 divide-y divide-border">
            {upcoming.map((t) => <TaskRow key={t.id} task={t} isWork={isWork} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && !isError && totalPending === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-3xl">{isWork ? '📋' : '✅'}</p>
          <p className="font-medium text-foreground">All clear!</p>
          <p className="text-sm text-muted-foreground">
            {isWork
              ? 'Capture a meeting to extract action items and decisions.'
              : 'Brain-dump your tasks by voice to get started.'}
          </p>
        </div>
      )}

      {/* Recent meetings (Work) / captures (Personal) */}
      {latestCaptures.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isWork ? 'Recent Meetings' : 'Recent Dumps'}
            </h2>
            <Link to="/captures" className={cn('text-xs font-medium', accentText)}>
              See all
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {latestCaptures.map((c) => (
              <Link
                key={c.id}
                to={`/captures/${c.id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <FileTextIcon size={16} className={cn('shrink-0 mt-0.5', accentText)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  {c.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.summary}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <ChevronRightIcon size={14} className="text-muted-foreground shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick shortcuts */}
      <div className="flex gap-2">
        <Link
          to="/capture"
          className={cn(
            'flex items-center gap-2 flex-1 py-3 px-4 rounded-xl font-medium text-sm text-white justify-center transition-all active:scale-95',
            isWork ? 'bg-indigo-600' : 'bg-emerald-600',
          )}
        >
          <PlusCircleIcon size={18} />
          {isWork ? 'New Meeting' : 'Brain Dump'}
        </Link>
        <Link
          to="/todo"
          className="flex items-center gap-2 flex-1 py-3 px-4 rounded-xl font-medium text-sm text-foreground bg-card border border-border justify-center transition-all active:scale-95"
        >
          All Tasks
          <ChevronRightIcon size={16} />
        </Link>
      </div>
    </div>
  )
}
