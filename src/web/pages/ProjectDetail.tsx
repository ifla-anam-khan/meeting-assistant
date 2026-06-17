import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  CheckCircle2Icon,
  CircleIcon,
  Trash2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useProjects, useUpdateProject, useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/lib/hooks'
import type { Task } from '@/lib/types'

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

function todayISO() {
  return new Date().toISOString().split('T')[0]!
}

function TaskRow({
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
  const today = todayISO()
  const isOverdue = task.dueDate && task.dueDate < today && task.status === 'pending'
  const accentText = isWork ? 'text-indigo-600' : 'text-emerald-600'

  return (
    <div className={cn('flex items-center gap-3 px-3 py-3 border-b border-border last:border-0', task.status === 'done' && 'opacity-60')}>
      <button
        onClick={() => onToggle(task.id, task.status === 'pending' ? 'done' : 'pending')}
        className="shrink-0 text-muted-foreground active:scale-90 transition-transform"
        aria-label={task.status === 'done' ? 'Mark pending' : 'Mark done'}
      >
        {task.status === 'done'
          ? <CheckCircle2Icon size={20} className={cn('shrink-0', accentText)} />
          : <CircleIcon size={20} className="shrink-0" />
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
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 text-muted-foreground active:scale-90 transition-transform p-1"
        aria-label="Delete task"
      >
        <Trash2Icon size={16} />
      </button>
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { space } = useAppStore()
  const isWork = space === 'work'
  const navigate = useNavigate()

  const accentBg = isWork ? 'bg-indigo-600' : 'bg-emerald-600'
  const accentRing = isWork ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'

  // Notes edit state
  const [editingNotes, setEditingNotes] = useState(false)
  const [editNotes, setEditNotes] = useState('')

  // Add task form
  const [showAdd, setShowAdd] = useState(false)
  const [newText, setNewText] = useState('')
  const [newPriority, setNewPriority] = useState<'normal' | 'high'>('normal')
  const [newDueDate, setNewDueDate] = useState('')

  const { data: projects, isLoading: projectsLoading, isError: projectsError } = useProjects('personal')
  const updateProject = useUpdateProject()

  const project = projects?.find((p) => p.id === id)

  const { data: tasks, isLoading: tasksLoading } = useTasks(space, undefined, id)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const handleToggle = (taskId: string, newStatus: 'pending' | 'done') => {
    updateTask.mutate({ id: taskId, status: newStatus })
  }

  const handleDeleteTask = (taskId: string) => {
    const task = tasks?.find((t) => t.id === taskId)
    if (!task) return
    deleteTask.mutate({ id: taskId, space: task.space })
  }

  const handleAddTask = async () => {
    if (!newText.trim() || !id) return
    await createTask.mutateAsync({
      space,
      text: newText.trim(),
      priority: newPriority,
      due_date: newDueDate || undefined,
      project_id: id,
    })
    setNewText('')
    setNewPriority('normal')
    setNewDueDate('')
    setShowAdd(false)
  }

  const handleNotesEdit = () => {
    setEditNotes(project?.notes ?? '')
    setEditingNotes(true)
  }

  const handleNotesSave = () => {
    if (!id) return
    updateProject.mutate({ id, notes: editNotes })
    setEditingNotes(false)
  }

  const handleNotesCancel = () => {
    setEditingNotes(false)
    setEditNotes(project?.notes ?? '')
  }

  const handleStatusToggle = () => {
    if (!id || !project) return
    updateProject.mutate({ id, status: project.status === 'active' ? 'done' : 'active' })
  }

  if (projectsLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 mb-4 text-foreground">
          <ArrowLeftIcon size={16} /> Back
        </button>
        Loading…
      </div>
    )
  }

  if (projectsError || !project) {
    return (
      <div className="p-4 text-sm text-destructive">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 mb-4 text-foreground">
          <ArrowLeftIcon size={16} /> Back
        </button>
        Project not found.
      </div>
    )
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto p-4 space-y-5">
      {/* Back */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground mb-3"
        >
          <ArrowLeftIcon size={14} />
          Projects
        </button>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
          {project.status === 'done' && (
            <span className="shrink-0 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full mt-1">
              Done
            </span>
          )}
        </div>
      </div>

      {/* Notes */}
      <section>
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h2>
          {!editingNotes && (
            <button
              onClick={handleNotesEdit}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Edit notes"
            >
              <PencilIcon size={12} />
            </button>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={4}
              className={cn(
                'w-full text-sm rounded-xl border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 resize-none',
                accentRing,
              )}
              placeholder="Add notes…"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleNotesCancel}
                className="text-xs text-muted-foreground px-3 py-1.5 flex items-center gap-1"
              >
                <XIcon size={14} />
                Cancel
              </button>
              <button
                onClick={handleNotesSave}
                disabled={updateProject.isPending}
                className={cn(
                  'flex items-center gap-1 text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-all',
                  accentBg,
                )}
              >
                <CheckIcon size={14} />
                {updateProject.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card px-3 py-3 min-h-[60px]">
            {project.notes ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{project.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes yet. Tap the pencil to add some.</p>
            )}
          </div>
        )}
      </section>

      {/* Status toggle */}
      <section>
        <button
          onClick={handleStatusToggle}
          disabled={updateProject.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all active:scale-95',
            project.status === 'active'
              ? 'border-border text-foreground bg-card hover:bg-muted'
              : cn('text-white border-transparent', accentBg),
          )}
        >
          {project.status === 'active' ? (
            <>
              <CheckIcon size={14} />
              Mark done
            </>
          ) : (
            <>
              <CircleIcon size={14} />
              Mark active
            </>
          )}
        </button>
      </section>

      {/* Tasks */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tasks</h2>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-all active:scale-95',
              accentBg,
            )}
          >
            <PlusIcon size={12} />
            Add
          </button>
        </div>

        {/* Quick add form */}
        {showAdd && (
          <div className="mb-3 rounded-xl border border-border bg-card p-3 space-y-2">
            <input
              autoFocus
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddTask() }}
              placeholder="Task description…"
              className={cn(
                'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2',
                accentRing,
              )}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
              />
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
                onClick={() => void handleAddTask()}
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

        {tasksLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Loading tasks…</p>
        )}

        {!tasksLoading && tasks && tasks.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-3 py-4 text-center text-sm text-muted-foreground">
            No tasks yet. Add one above.
          </div>
        )}

        {tasks && tasks.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isWork={isWork}
                onToggle={handleToggle}
                onDelete={handleDeleteTask}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
