import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, CheckCircle2Icon,
  CircleIcon, UserIcon, ShareIcon, Trash2Icon, PencilIcon, CheckIcon, XIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useCapture, useRenameCapture, useDeleteCapture, useUpdateTask, useDeleteRememberItem, useRetryCapture } from '@/lib/hooks'
import type { Task, RememberItem, Contact, Space } from '@/lib/types'

function TaskItem({ task, space }: { task: Task; space: Space }) {
  const updateTask = useUpdateTask()
  const [showSource, setShowSource] = useState(false)
  const today = new Date().toISOString().split('T')[0]!
  const isOverdue = task.dueDate && task.dueDate < today && task.status === 'pending'
  const isDone = task.status === 'done'
  const checkColor = space === 'work' ? 'text-indigo-600' : 'text-emerald-600'
  const quoteBar = space === 'work' ? 'border-indigo-300' : 'border-emerald-300'

  const toggle = () => {
    updateTask.mutate({ id: task.id, status: isDone ? 'pending' : 'done' })
  }

  return (
    <div className="py-3 border-b border-border last:border-0 px-3">
      <div className="flex items-start gap-2">
        <button onClick={toggle} disabled={updateTask.isPending} className="shrink-0 mt-0.5 transition-opacity active:opacity-50">
          {isDone
            ? <CheckCircle2Icon size={16} className={checkColor} />
            : <CircleIcon size={16} className="text-muted-foreground" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm', isDone && 'line-through text-muted-foreground')}>
            {task.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.dueDate && (
              <span className={cn('text-xs', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                {isOverdue ? 'Overdue · ' : ''}{new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
            <p className={cn('text-xs italic text-muted-foreground mt-1 border-l-2 pl-2', quoteBar)}>
              "{task.sourceQuote}"
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function RememberCard({ item, space }: { item: RememberItem; space: Space }) {
  const [open, setOpen] = useState(false)
  const deleteItem = useDeleteRememberItem()
  return (
    <div className="py-3 border-b border-border last:border-0 px-3">
      <div className="flex items-start gap-2">
        <p className="text-sm text-foreground flex-1">{item.text}</p>
        <button
          onClick={() => deleteItem.mutate({ id: item.id, space })}
          disabled={deleteItem.isPending}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Delete"
        >
          <XIcon size={14} />
        </button>
      </div>
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
  const navigate = useNavigate()

  const [showTranscript, setShowTranscript] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading, isError } = useCapture(id ?? '')
  const renameCapture = useRenameCapture()
  const deleteCapture = useDeleteCapture()
  const retryCapture = useRetryCapture()

  useEffect(() => {
    if (data) setNameValue(data.session.name)
  }, [data])

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  // Auto-cancel delete confirm after 4s
  useEffect(() => {
    if (!confirmDelete) return
    confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 4000)
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }
  }, [confirmDelete])

  const handleShare = async () => {
    if (!navigator.share || !data) return
    await navigator.share({
      title: data.session.name,
      text: `${data.session.name}\n\n${data.session.summary ?? ''}\n\nAction items:\n${data.tasks.map((t) => `- ${t.text}`).join('\n')}`,
    }).catch(() => {})
  }

  const handleSaveName = () => {
    if (!data || !nameValue.trim() || nameValue.trim() === data.session.name) {
      setEditingName(false)
      return
    }
    renameCapture.mutate({ id: id!, name: nameValue.trim(), space: data.session.space })
    setEditingName(false)
  }

  const handleDeleteClick = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    deleteCapture.mutate(
      { id: id!, space: data!.session.space },
      { onSuccess: () => navigate('/captures', { replace: true }) },
    )
  }

  const backLabel = isWork ? 'Meetings' : 'Brain Dumps'

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <Link to="/captures" className="flex items-center gap-1 mb-4 text-foreground">
          <ArrowLeftIcon size={16} /> {backLabel}
        </Link>
        Loading…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-4 text-sm text-destructive">
        <Link to="/captures" className="flex items-center gap-1 mb-4 text-foreground">
          <ArrowLeftIcon size={16} /> {backLabel}
        </Link>
        Could not load this capture.
      </div>
    )
  }

  if (data.session.status === 'processing') {
    return (
      <div className="p-4">
        <Link to="/captures" className="flex items-center gap-1 mb-6 text-sm text-muted-foreground">
          <ArrowLeftIcon size={14} /> {backLabel}
        </Link>
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-border border-t-indigo-600 rounded-full" />
          <div>
            <p className="text-sm font-medium text-foreground">Extracting insights…</p>
            <p className="text-xs text-muted-foreground mt-1">AI is reading your transcript. This page will update automatically.</p>
          </div>
        </div>
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
        <div className="flex items-center justify-between mb-3">
          <Link to="/captures" className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeftIcon size={14} />
            {backLabel}
          </Link>
          <div className="flex items-center gap-1">
            {data?.session.status === 'failed' && (
              <button
                onClick={() => retryCapture.mutate({ id: id!, space: data!.session.space })}
                disabled={retryCapture.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-all active:scale-95"
              >
                <RefreshCwIcon size={14} className={retryCapture.isPending ? 'animate-spin' : ''} />
                {retryCapture.isPending ? 'Retrying…' : 'Retry'}
              </button>
            )}
            {'share' in navigator && (
              <button
                onClick={() => void handleShare()}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95',
                  isWork ? 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
                )}
              >
                <ShareIcon size={14} />
                Share
              </button>
            )}
            <button
              onClick={handleDeleteClick}
              disabled={deleteCapture.isPending}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95',
                confirmDelete
                  ? 'text-white bg-destructive hover:bg-destructive/90'
                  : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
              )}
            >
              <Trash2Icon size={14} />
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </button>
          </div>
        </div>

        {/* Editable meeting name */}
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="flex-1 text-xl font-semibold text-foreground bg-transparent border-b-2 border-indigo-500 outline-none"
            />
            <button onClick={handleSaveName} className="text-indigo-600"><CheckIcon size={18} /></button>
            <button onClick={() => setEditingName(false)} className="text-muted-foreground"><XIcon size={18} /></button>
          </div>
        ) : (
          <div className="flex items-start gap-2 group">
            <h1 className="text-xl font-semibold text-foreground flex-1">{session.name}</h1>
            <button
              onClick={() => setEditingName(true)}
              className="shrink-0 mt-1 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity active:scale-95"
              aria-label="Rename meeting"
            >
              <PencilIcon size={14} />
            </button>
          </div>
        )}

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
            {tasks.map((t) => <TaskItem key={t.id} task={t} space={session.space} />)}
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
            {decisions.map((i) => <RememberCard key={i.id} item={i} space={session.space} />)}
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
            {openQuestions.map((i) => <RememberCard key={i.id} item={i} space={session.space} />)}
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
            {followUps.map((i) => <RememberCard key={i.id} item={i} space={session.space} />)}
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
