import { useAppStore } from '@/store'

export default function CapturesList() {
  const { space } = useAppStore()

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">
        {space === 'work' ? 'Meetings' : 'Brain Dumps'}
      </h1>
      <div className="rounded-xl border border-border bg-card p-4 text-center text-muted-foreground text-sm">
        No {space === 'work' ? 'meetings' : 'brain dumps'} captured yet.
      </div>
    </div>
  )
}
