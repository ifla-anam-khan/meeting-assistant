import { useState, useEffect } from 'react'
import { BellIcon, BellOffIcon, DownloadIcon, CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { usePush } from '@/hooks/usePush'
import { apiGet, apiPatch } from '@/lib/api'

interface AppSettings {
  digestTime: string
  digestEnabled: boolean
  digestCombined: boolean
}

export default function Settings() {
  const { space } = useAppStore()
  const { state: pushState, error: pushError, subscribe, unsubscribe } = usePush()

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiGet<AppSettings>('/settings').then(setSettings).catch(() => {})
  }, [])

  const saveSettings = async (patch: Partial<AppSettings>) => {
    if (!settings) return
    const updated = { ...settings, ...patch }
    setSettings(updated)
    setSaving(true)
    try {
      await apiPatch('/settings', patch)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // revert on error
      setSettings(settings)
    } finally {
      setSaving(false)
    }
  }

  const handleExport = (format: 'json' | 'markdown') => {
    window.location.href = `/api/export?format=${format}&space=${space}`
  }

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      {/* Push notifications */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Notifications
        </h2>
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">Daily digest</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pushState === 'subscribed'
                  ? 'Push enabled — you\'ll get a digest at the configured time'
                  : pushState === 'denied'
                    ? 'Notifications blocked in browser settings'
                    : pushState === 'unsupported'
                      ? 'Not supported on this browser'
                      : 'Get a daily summary of pending tasks'}
              </p>
              {pushError && <p className="text-xs text-destructive mt-1">{pushError}</p>}
            </div>
            <button
              onClick={() => pushState === 'subscribed' ? unsubscribe() : subscribe()}
              disabled={pushState === 'loading' || pushState === 'unsupported' || pushState === 'denied'}
              className={cn(
                'shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                pushState === 'subscribed'
                  ? 'bg-muted text-muted-foreground'
                  : pushState === 'loading'
                    ? 'bg-muted text-muted-foreground opacity-50'
                    : 'bg-indigo-600 text-white',
              )}
            >
              {pushState === 'subscribed' ? (
                <><BellOffIcon size={14} /> Disable</>
              ) : pushState === 'loading' ? (
                <><span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" /> …</>
              ) : (
                <><BellIcon size={14} /> Enable</>
              )}
            </button>
          </div>

          {/* Digest time */}
          {settings && (
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Digest time</p>
                <p className="text-xs text-muted-foreground mt-0.5">Local time for the daily digest push</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={settings.digestTime}
                  onChange={(e) => void saveSettings({ digestTime: e.target.value })}
                  className="text-sm rounded-lg border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {saved && <CheckIcon size={14} className="text-emerald-600" />}
                {saving && <span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full" />}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* LLM info */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          AI Model
        </h2>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-1">
          <p className="text-sm font-medium text-foreground">Gemini 2.5 Flash-Lite</p>
          <p className="text-xs text-muted-foreground">
            Extraction — free tier, 1,000 req/day. Chat uses Gemini 2.5 Flash (250 req/day).
            Switch providers by updating <code className="text-xs bg-muted px-1 rounded">GEMINI_API_KEY</code> in Worker secrets.
          </p>
        </div>
      </section>

      {/* Export */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Export data ({space})
        </h2>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-xs text-muted-foreground mb-3">
            Download all captures, tasks, decisions, and contacts for the current space.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('markdown')}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border text-foreground font-medium bg-background transition-all active:scale-95"
            >
              <DownloadIcon size={14} />
              Markdown
            </button>
            <button
              onClick={() => handleExport('json')}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border text-foreground font-medium bg-background transition-all active:scale-95"
            >
              <DownloadIcon size={14} />
              JSON
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
