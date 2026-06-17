import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, CheckCircle2Icon, CircleIcon, UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useCapture } from '@/lib/hooks'
import type { Task, RememberItem, Contact } from '@/lib/types'

function TaskItem({ task }: { task: Task }) {
  const [showSource, setShowSource] = useState(false)
  const today = new Date().toISOString().split('T')[0]!
  const isOverdue = task.dueDate && task.dueDate < today && task.status === 'pending'

  return (
    <div className="py-3 border-b border-border last:border-0 px-3">
      <div className="flex items-start gap-2">
        {task.status === 'done'
          ? <CheckCircle2Icon size={16} className="text-indigo-600 shrink-0 mt-0.5" />
          : <CircleIcon size={16} className="text-muted-foreground shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.dueDate && (
              <span className={cn('text-xs', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                {isOverdue ? `Overdue · ` : ''}{new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {task.priority === 'high' && <span className="text-xs font-semibold text-orange-500">HIGH</span>}
            {task.assignedBy && <span className="text-xs text-muted-foreground">from {task.assignedBy}</span>}
            {task.sourceQuote && (
              <button onClick={() => setShowSource((v) => !v)} className="text-xs text-muted-foreground flex items-center gap-0.5">
                Quote {showSource ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}
              </button>
            )}
          </div>
          {showSource && task.sourceQuote && (
            <p className="text-xs italic text-muted-foreground mt-1 border-l-2 border-indigo-300 pl-2">
              "{task.sourceQuote}"
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function RememberCard({ item }: { item: RememberItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-3 border-b border-border last:border-0 px-3">
      <p className="text-sm text-foreground">{item.text}</p>
      {item.sourceQuote && (
        <>
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-muted-foreground flex items-center gap-0.5 mt-1">
            Source {open ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}
          </button>
          {open && <p className="text-xs italic text-muted-foreground mt-1 border-l-2 border-border pl-2">"{item.sourceQuote}"</p>}
        </>
      )}
    </div>
  )
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <div className="flex items-start gap-2 py-3 border-b border-border last:border-0 px-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5">
        <UserIcon size={14} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{contact.name}</p>
        <p className="text-xs text-muted-foreground">{contact.topic}</p>
        {contact.notes && <p className="text-xs text-muted-foreground">{contact.notes}</p>}
      </div>
    </div>
  )
}

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>()
  const { space } = useAppStore()
  const isWork = space === 'work'
  const [showTranscript, setShowTranscript] = useState(false)

  const { data, isLoading, isError } = useCapture(id ?? '')

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <Link to="/captures" className="flex items-center gap-1 mb-4 text-foreground">
          <ArrowLeftIcon size={16} /> Back
        </Link>
        Loading…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-4 text-sm text-destructive">
        <Link to="/captures" className="flex items-center gap-1 mb-4 text-foreground">
          <ArrowLeftIcon size={16} /> Back
        </Link>
        Could not load this capture.
      </div>
    )
  }

  const { session, tasks, rememberItems, contacts } = data
  const decisions = rememberItems.filter((i) => i.type === 'decision')
  const openQuestions = rememberItems.filter((i) => i.type === 'open-question')
  const followUps = rememberItems.filter((i) => i.type === 'follow-up')
  const date = new Date(session.createdAt)

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <Link to="/captures" className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeftIcon size={14} />
          {isWork ? 'Meetings' : 'Brain Dumps'}
        </Link>
        <h1 className="text-xl font-semibold text-foreground">{session.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {' · '}
          {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      {/* TL;DR */}
      {session.summary && (
        <div className={cn(
          'rounded-xl p-4 border',
          isWork ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800' : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800',
        )}>
          <p className={cn('text-xs font-semibold uppercase tracking-wide mb-1.5', isWork ? 'text-indigo-700' : 'text-emerald-700')}>
            TL;DR
          </p>
          <p className="text-sm text-foreground">{session.summary}</p>
        </div>
      )}

      {/* Action items / Tasks */}
      {tasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {isWork ? 'Action Items' : 'Tasks'} ({tasks.length})
          </h2>
          <div className="rounded-xl border border-border bg-card">
            {tasks.map((t) => <TaskItem key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Decisions ({decisions.length})
          </h2>
          <div className="rounded-xl border border-border bg-card">
            {decisions.map((i) => <RememberCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      {/* Contacts */}
      {contacts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Contacts ({contacts.length})
          </h2>
          <div className="rounded-xl border border-border bg-card">
            {contacts.map((c) => <ContactCard key={c.id} contact={c} />)}
          </div>
        </section>
      )}

      {/* Open questions */}
      {openQuestions.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Open Questions ({openQuestions.length})
          </h2>
          <div className="rounded-xl border border-border bg-card">
            {openQuestions.map((i) => <RememberCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Follow-ups ({followUps.length})
          </h2>
          <div className="rounded-xl border border-border bg-card">
            {followUps.map((i) => <RememberCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      {/* Transcript toggle */}
      <section>
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground w-full"
        >
          <span>{showTranscript ? 'Hide' : 'Show'} transcript</span>
          {showTranscript ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        </button>
        {showTranscript && (
          <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {session.rawTranscript}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
