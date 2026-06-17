export default function Settings() {
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      {[
        { label: 'Daily digest time', value: '8:00 AM' },
        { label: 'LLM provider', value: 'Gemini 2.5 Flash-Lite (free)' },
        { label: 'Push notifications', value: 'Not set up' },
      ].map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-sm text-muted-foreground">{value}</span>
        </div>
      ))}

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm font-medium text-foreground mb-1">Export data</p>
        <p className="text-xs text-muted-foreground">Download all captures and tasks as Markdown or JSON.</p>
        <div className="flex gap-2 mt-3">
          <button className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground font-medium" disabled>
            Markdown
          </button>
          <button className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground font-medium" disabled>
            JSON
          </button>
        </div>
      </div>
    </div>
  )
}
