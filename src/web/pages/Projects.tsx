import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusIcon, Trash2Icon, FolderOpenIcon, XIcon, CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useProjects, useCreateProject, useDeleteProject } from '@/lib/hooks'

export default function Projects() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const navigate = useNavigate()

  const accentBg = 'bg-emerald-600'
  const accentText = 'text-emerald-600'
  const accentRing = 'focus:ring-emerald-500'

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const { data: projects, isLoading, isError } = useProjects('personal')
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()

  const handleAdd = async () => {
    if (!newName.trim()) return
    await createProject.mutateAsync({
      space: 'personal',
      name: newName.trim(),
      notes: newNotes.trim() || undefined,
    })
    setNewName('')
    setNewNotes('')
    setShowAdd(false)
  }

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Delete project "${name}"? Its tasks will remain in your task list.`)) return
    deleteProject.mutate({ id, space: 'personal' })
  }

  if (isWork) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center gap-3 mt-12">
        <FolderOpenIcon size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Switch to Personal to manage projects.
        </p>
      </div>
    )
  }

  const active = (projects ?? []).filter((p) => p.status === 'active')
  const done = (projects ?? []).filter((p) => p.status === 'done')
  const sorted = [...active, ...done]

  return (
    <div className="flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
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

      {/* Inline add form */}
      {showAdd && (
        <div className="mx-4 mb-3 rounded-xl border border-border bg-card p-3 space-y-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
            placeholder="Project name…"
            className={cn(
              'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2',
              accentRing,
            )}
          />
          <textarea
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (optional)…"
            rows={2}
            className={cn(
              'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 resize-none',
              accentRing,
            )}
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setNewName(''); setNewNotes('') }}
              className="text-xs text-muted-foreground px-3 py-1.5 flex items-center gap-1"
            >
              <XIcon size={14} />
              Cancel
            </button>
            <button
              onClick={() => void handleAdd()}
              disabled={!newName.trim() || createProject.isPending}
              className={cn(
                'flex items-center gap-1 text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-all',
                newName.trim() ? accentBg : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <CheckIcon size={14} />
              {createProject.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Loading / error */}
      {isLoading && (
        <p className="text-sm text-muted-foreground text-center p-6">Loading…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive text-center p-6">Could not load projects.</p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && sorted.length === 0 && (
        <div className="p-6 text-center space-y-2">
          <FolderOpenIcon size={32} className="text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            No projects yet. Add one to group your Personal tasks.
          </p>
        </div>
      )}

      {/* Project list */}
      {sorted.length > 0 && (
        <div className="mx-4 mt-2 rounded-xl border border-border bg-card">
          {sorted.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-3 px-3 py-3 border-b border-border last:border-0"
            >
              <button
                onClick={() => navigate(`/projects/${project.id}`)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm font-medium text-foreground truncate', project.status === 'done' && 'line-through text-muted-foreground')}>
                    {project.name}
                  </p>
                  {project.status === 'done' && (
                    <span className="shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      Done
                    </span>
                  )}
                </div>
                {project.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {project.notes}
                  </p>
                )}
              </button>

              <button
                onClick={() => handleDelete(project.id, project.name)}
                className="shrink-0 text-muted-foreground active:scale-90 transition-transform p-1"
                aria-label="Delete project"
              >
                <Trash2Icon size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Accent bar at top for space context */}
      <div className={cn('h-0.5 w-8 rounded-full mx-4 mt-4', accentBg)} />
      <p className={cn('text-xs px-4 mt-1 mb-4', accentText)}>Personal space</p>
    </div>
  )
}
