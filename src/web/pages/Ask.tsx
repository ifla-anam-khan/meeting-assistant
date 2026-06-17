import { useState, useRef, useEffect, useCallback } from 'react'
import { SendIcon, SearchIcon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export default function Ask() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const accentBg = isWork ? 'bg-indigo-600' : 'bg-emerald-600'
  const accentRing = isWork ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset chat when space changes
  useEffect(() => {
    setMessages([])
    setError(null)
    abortRef.current?.abort()
  }, [space])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isStreaming) return

    setError(null)
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    setIsStreaming(true)

    // Add empty assistant message that will be filled via streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }])

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, space }),
        credentials: 'include',
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Consume SSE stream
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break

          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + data }
            }
            return next
          })
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      console.error('[ask] error:', err)
      setError('Could not get a response. Check your connection.')
      // Remove the empty assistant message
      setMessages((prev) => prev.filter((_, i) => i < prev.length - 1))
    } finally {
      // Mark streaming done
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, isStreaming: false }
        }
        return next
      })
      setIsStreaming(false)
    }
  }, [isStreaming, space])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const suggestions = isWork
    ? ['What did we decide about the cloud budget?', 'What\'s overdue this week?', 'Who is responsible for the API migration?']
    : ['What tasks do I have for today?', 'What\'s left on my SaaS launch?', 'Show me anything marked high priority']

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="text-center pt-4">
              <div className={cn(
                'inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3',
                isWork ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600',
              )}>
                <SearchIcon size={22} />
              </div>
              <p className="font-medium text-foreground">Ask your {space} data</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {isWork
                  ? 'Ask about meetings, decisions, tasks, and contacts.'
                  : 'Ask about your tasks, projects, and plans.'}
              </p>
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void sendMessage(s)}
                  className="w-full text-left text-sm px-4 py-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
              msg.role === 'user'
                ? cn('text-white', accentBg)
                : 'bg-muted text-foreground',
            )}>
              {msg.content || (msg.isStreaming && (
                <Loader2Icon size={16} className="animate-spin text-muted-foreground" />
              ))}
              {msg.isStreaming && msg.content && (
                <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-pulse" />
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="text-sm text-destructive text-center bg-destructive/10 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 pb-safe">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isWork ? 'Ask about your meetings…' : 'Ask about your tasks…'}
            disabled={isStreaming}
            className={cn(
              'flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2',
              accentRing,
            )}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={cn(
              'shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-white transition-all active:scale-95',
              input.trim() && !isStreaming ? accentBg : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {isStreaming
              ? <Loader2Icon size={18} className="animate-spin" />
              : <SendIcon size={18} />
            }
          </button>
        </form>
      </div>
    </div>
  )
}
