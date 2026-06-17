import { useState } from 'react'
import { CheckCircle2Icon, CircleIcon, Trash2Icon, PlusIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useTasks, useUpdateTask, useDeleteTask, useCreateTask } from '@/lib/hooks'
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
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TaskItem({
  task,
  isWork,
  onToggle,
  onDelete,
}: {
  task: Task
  isWork: boolean
  onToggle: (id: string, newStatus: 'pending' | 'done') => void
  onDelete: (id: string) => void
}) {
  const [showSource, setShowSource] = useState(false)
  const today = todayISO()
  const isOverdue = task.dueDate && task.dueDate < today && task.status === 'pending'
  const accentText = isWork ? 'text-indigo-600' : 'text-emerald-600'

  return (
    <div className={cn('px-3 border-b border-border last:border-0', task.status === 'done' && 'opacity-60')}>
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={() => onToggle(task.id, task.status === 'pending' ? 'done' : 'pending')}
          className="shrink-0 text-muted-foreground active:scale-90 transition-transform"
          aria-label={task.status === 'done' ? 'Mark pending' : 'Mark done'}
        >
          {task.status === 'done'
            ? <CheckCircle2Icon size={22} className={cn('shrink-0', accentText)} />
            : <CircleIcon size={22} className="shrink-0" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm', task.status === 'done' && 'line-through')}>
            {task.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.dueDate && (
              <span className={cn(
                'text-xs font-medium',
                isOverdue ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {formatDate(task.dueDate)}
              </span>
            )}
            {task.priority === 'high' && (
              <span className="text-xs font-semibold text-orange-500">HIGH</span>
            )}
            {task.assignedBy && (
              <span className="text-xs text-muted-foreground">from {task.assignedBy}</span>
            )}
            {task.sourceQuote && (
              <button
                onClick={() => setShowSource((v) => !v)}
                className="text-xs text-muted-foreground flex items-center gap-0.5"
              >
                Quote {showSource ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}
              </button>
            )}
          </div>
          {showSource && task.sourceQuote && (
            <p className="text-xs italic text-muted-foreground mt-1 border-l-2 border-border pl-2">
              "{task.sourceQuote}"
            </p>
          )}
        </div>

        <button
          onClick={() => onDelete(task.id)}
          className="shrink-0 text-muted-foreground active:scale-90 transition-transform p-1"
          aria-label="Delete task"
        >
          <Trash2Icon size={16} />
        </button>
      </div>
    </div>
  )
}

export default function Todo() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const accentBg = isWork ? 'bg-indigo-600' : 'bg-emerald-600'
  const accentRing = isWork ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'

  const [filter, setFilter] = useState<'pending' | 'done'>('pending')
  const [showAdd, setShowAdd] = useState(false)
  const [newText, setNewText] = useState('')
  const [newPriority, setNewPriority] = useState<'normal' | 'high'>('normal')

  const { data: tasks, isLoading, isError } = useTasks(space, filter)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const createTask = useCreateTask()

  const handleToggle = (id: string, newStatus: 'pending' | 'done') => {
    updateTask.mutate({ id, status: newStatus })
  }

  const handleDelete = (id: string) => {
    const task = tasks?.find((t) => t.id === id)
    if (!task) return
    deleteTask.mutate({ id, space: task.space })
  }

  const handleAdd = async () => {
    if (!newText.trim()) return
    await createTask.mutateAsync({ space, text: newText.trim(), priority: newPriority })
    setNewText('')
    setNewPriority('normal')
    setShowAdd(false)
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-xl font-semibold text-foreground">
          {isWork ? 'Action Items' : 'Tasks'}
        </h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all active:scale-95',
            accentBg,
          )}
        >
          <PlusIcon size={16} />
          Add
        </button>
      </div>

      {/* Quick add */}
      {showAdd && (
        <div className="mx-4 mb-3 rounded-xl border border-border bg-card p-3 space-y-2">
          <input
            autoFocus
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
            placeholder="Task description…"
            className={cn(
              'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2',
              accentRing,
            )}
          />
          <div className="flex items-center gap-2">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as 'normal' | 'high')}
              className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
            >
              <option value="normal">Normal priority</option>
              <option value="high">High priority</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={() => setShowAdd(false)}
              className="text-xs text-muted-foreground px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleAdd()}
              disabled={!newText.trim() || createTask.isPending}
              className={cn(
                'text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-all',
                newText.trim() ? accentBg : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {createTask.isPending ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex border-b border-border mx-4">
        {(['pending', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex-1 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
              filter === f
                ? isWork ? 'border-indigo-600 text-indigo-600' : 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task list */}
      {isLoading && (
        <p className="text-sm text-muted-foreground text-center p-6">Loading…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive text-center p-6">Could not load tasks.</p>
      )}
      {!isLoading && !isError && tasks && tasks.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          {filter === 'pending' ? 'No pending tasks.' : 'No completed tasks yet.'}
        </div>
      )}
      {tasks && tasks.length > 0 && (
        <div className="mx-4 mt-2 rounded-xl border border-border bg-card">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isWork={isWork}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
