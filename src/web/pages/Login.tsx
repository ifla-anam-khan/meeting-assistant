import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function Login() {
  const [token, setTokenValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/tasks?space=work&status=pending', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      })
      if (res.status === 401) {
        setError('Wrong password. Try again.')
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError('Server error. Try again in a moment.')
        setLoading(false)
        return
      }
      setToken(token.trim())
      navigate('/', { replace: true })
    } catch {
      setError('Could not reach server. Check your connection.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Meeting Assistant</h1>
          <p className="text-sm text-muted-foreground">Enter your access password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={token}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder="Password"
            className={cn(
              'w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500',
              error && 'border-destructive focus:ring-destructive',
            )}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={!token.trim() || loading}
            className={cn(
              'w-full py-3 rounded-xl text-sm font-medium text-white transition-all active:scale-95',
              token.trim() && !loading
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
