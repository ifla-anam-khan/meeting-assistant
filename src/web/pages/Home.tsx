import { useAppStore } from '@/store'

export default function Home() {
  const { space } = useAppStore()
  const isWork = space === 'work'

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Today</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-center space-y-2">
        <p className="text-2xl">
          {isWork ? '📋' : '✅'}
        </p>
        <p className="font-medium text-foreground">No tasks yet</p>
        <p className="text-sm text-muted-foreground">
          {isWork
            ? 'Capture a meeting to extract action items, decisions, and follow-ups.'
            : 'Brain-dump your tasks by voice to get started.'}
        </p>
      </div>
    </div>
  )
}
