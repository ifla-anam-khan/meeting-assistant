import { useAppStore } from '@/store'

export default function Todo() {
  const { space } = useAppStore()

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">
          {space === 'work' ? 'Action Items' : 'Tasks'}
        </h1>
        <button
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
          aria-label="Add task"
        >
          + Add
        </button>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-center text-muted-foreground text-sm">
        No tasks yet. Complete a capture to auto-populate.
      </div>
    </div>
  )
}
