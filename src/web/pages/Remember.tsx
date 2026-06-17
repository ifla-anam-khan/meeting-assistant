import { useAppStore } from '@/store'

export default function Remember() {
  const { space } = useAppStore()

  if (space === 'personal') {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <p className="text-muted-foreground text-sm">Switch to Work space to view decisions and contacts.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">Remember</h1>
      <p className="text-sm text-muted-foreground">Decisions, key facts, contacts, and open questions from your meetings.</p>

      {(['decisions', 'contacts', 'open questions'] as const).map((section) => (
        <div key={section} className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold capitalize text-foreground mb-2">{section}</h2>
          <p className="text-sm text-muted-foreground">None captured yet.</p>
        </div>
      ))}
    </div>
  )
}
