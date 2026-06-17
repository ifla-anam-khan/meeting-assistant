import { useParams } from 'react-router-dom'

export default function CaptureDetail() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">Capture</h1>
      <p className="text-sm text-muted-foreground">ID: {id}</p>
      <div className="rounded-xl border border-border bg-card p-4 text-center text-muted-foreground text-sm">
        Transcript, extracted items, and source-quote highlighting will appear here.
      </div>
    </div>
  )
}
