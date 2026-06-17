import { useAppStore } from '@/store'

export default function NewCapture() {
  const { space } = useAppStore()
  const isWork = space === 'work'

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">
        {isWork ? 'New Meeting' : 'Brain Dump'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {isWork
          ? 'Record live or paste a transcript. AI will extract your action items, decisions, and follow-ups.'
          : 'Tap record and talk — tasks, projects, routines. AI will organize them for you.'}
      </p>

      {/* Transcript area — Phase 1.D: live recording hook + paste + extraction wired here */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-muted-foreground text-sm">
        Live recording and paste capture coming in Phase 1.D
      </div>
    </div>
  )
}
