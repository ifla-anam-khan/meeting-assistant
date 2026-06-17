import { useAppStore } from '@/store'

export default function Ask() {
  const { space } = useAppStore()

  return (
    <div className="flex flex-col h-full p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground mb-1">Ask</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {space === 'work'
          ? 'Ask anything — "What did we decide about the cloud budget?" or "What\'s overdue?"'
          : 'Ask about your tasks — "What\'s left on the SaaS launch?" or "What did I plan for this week?"'}
      </p>
      <div className="flex-1 rounded-xl border border-border bg-card p-4 text-center text-muted-foreground text-sm">
        Chat over your data — coming in Phase 2.
      </div>
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Ask your assistant…"
          disabled
        />
        <button
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled
        >
          Send
        </button>
      </div>
    </div>
  )
}
