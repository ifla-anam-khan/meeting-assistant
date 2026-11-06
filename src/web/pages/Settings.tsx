import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, BellOffIcon, DownloadIcon, CheckIcon, ActivityIcon, AlertCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { usePush } from '@/hooks/usePush'
import { useRecentErrors } from '@/lib/hooks'
import { apiGet, apiPatch, getToken } from '@/lib/api'

interface AppSettings {
  digestTime: string
  digestEnabled: boolean
  digestCombined: boolean
  eveningDigestEnabled: boolean
  eveningDigestTime: string
}

export default function Settings() {
  const { space } = useAppStore()
  const { state: pushState, error: pushError, subscribe, unsubscribe } = usePush()
  const { data: recentErrors } = useRecentErrors()
  const errorCount = recentErrors?.length ?? 0

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

  const handleExport = async (format: 'json' | 'markdown') => {
    const token = getToken()
    try {
      const res = await fetch(`/api/export?format=${format}&space=${space}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = format === 'markdown' ? 'md' : 'json'
      a.download = `meeting-assistant-${space}-${new Date().toISOString().split('T')[0]}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — user will see nothing downloaded
    }
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
            {pushState === 'denied' ? (
              <a
                href="about:blank"
                onClick={(e) => { e.preventDefault(); alert('Notifications are blocked in your browser. Go to your browser Settings → Site Settings → Notifications and allow this site.') }}
                className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 cursor-pointer"
              >
                <BellOffIcon size={14} /> Blocked
              </a>
            ) : pushState === 'unsupported' ? (
              <span className="shrink-0 text-xs text-muted-foreground px-3 py-1.5">Not supported</span>
            ) : (
              <button
                onClick={() => pushState === 'subscribed' ? unsubscribe() : subscribe()}
                disabled={pushState === 'loading'}
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
            )}
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

          {/* Evening digest */}
          {settings && (
            <div className="border-t border-border">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Evening digest</p>
                  <p className="text-xs text-muted-foreground mt-0.5">End-of-day summary of completed and pending tasks</p>
                </div>
                <button
                  role="switch"
                  aria-checked={settings.eveningDigestEnabled}
                  onClick={() => void saveSettings({ eveningDigestEnabled: !settings.eveningDigestEnabled })}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                    settings.eveningDigestEnabled ? 'bg-indigo-600' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                      settings.eveningDigestEnabled ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {settings.eveningDigestEnabled && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">Evening digest time</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Local time for the evening digest push</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={settings.eveningDigestTime}
                      onChange={(e) => void saveSettings({ eveningDigestTime: e.target.value })}
                      className="text-sm rounded-lg border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {saved && <CheckIcon size={14} className="text-emerald-600" />}
                    {saving && <span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full" />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Logs */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          System Logs
        </h2>
        <Link
          to="/logs"
          className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-border bg-card active:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ActivityIcon size={18} className={errorCount > 0 ? 'text-destructive' : 'text-muted-foreground'} />
            <div>
              <p className="text-sm font-medium text-foreground">View logs</p>
              <p className="text-xs text-muted-foreground mt-0.5">API errors, extraction failures, system events</p>
            </div>
          </div>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-full">
              <AlertCircleIcon size={12} />
              {errorCount} error{errorCount !== 1 ? 's' : ''} today
            </span>
          )}
        </Link>
      </section>

      {/* LLM info */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          AI Model
        </h2>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-1">
          <p className="text-sm font-medium text-foreground">GPT-4o-mini / GPT-4o / Whisper-1</p>
          <p className="text-xs text-muted-foreground">
            Extraction uses gpt-4o-mini, chat uses gpt-4o, transcription uses Whisper-1.
            Update <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code> in Worker secrets to change the key.
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
              onClick={() => void handleExport('markdown')}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border text-foreground font-medium bg-background transition-all active:scale-95"
            >
              <DownloadIcon size={14} />
              Markdown
            </button>
            <button
              onClick={() => void handleExport('json')}
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
