import { useCallback, useEffect, useRef, useState } from 'react'

// ── Web Speech API type declarations ─────────────────────────────────────
// TypeScript's DOM lib coverage for SpeechRecognition is incomplete; declare what we need.

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  readonly [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  readonly [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: 'no-speech' | 'aborted' | 'audio-capture' | 'network' | 'not-allowed' | 'service-not-allowed' | 'bad-grammar' | 'language-not-supported'
  readonly message: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionCtor {
  new(): SpeechRecognitionInstance
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ── Public types ──────────────────────────────────────────────────────────

export type SpeechError =
  | 'not-supported'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'network'
  | 'unknown'

export interface UseSpeechReturn {
  transcript: string
  isListening: boolean
  error: SpeechError | null
  start: () => void
  stop: () => void
  reset: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<SpeechError | null>(null)
  const [displayTranscript, setDisplayTranscript] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const committedRef = useRef('')
  const interimRef = useRef('')
  const intendToListenRef = useRef(false)
  const backoffRef = useRef(250)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const updateDisplay = useCallback(() => {
    setDisplayTranscript(committedRef.current + interimRef.current)
  }, [])

  // ── Wake lock ─────────────────────────────────────────────────────────

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Non-fatal: screen may sleep mid-meeting
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'visible' && intendToListenRef.current) {
        void acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [acquireWakeLock])

  // ── Core recognition ──────────────────────────────────────────────────

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setError('not-supported')
      return
    }

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    recognitionRef.current = rec

    rec.onresult = (event: SpeechRecognitionEvent) => {
      interimRef.current = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const item = result[0]
        if (!item) continue
        if (result.isFinal) {
          committedRef.current += item.transcript
          backoffRef.current = 250
        } else {
          interimRef.current += item.transcript
        }
      }
      updateDisplay()
    }

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event.error
      if (code === 'no-speech' || code === 'aborted') {
        return // Benign — onend restarts
      }
      if (code === 'network') {
        backoffRef.current = Math.min(backoffRef.current * 2, 8000)
        return
      }
      intendToListenRef.current = false
      setIsListening(false)
      setError(code === 'not-allowed' || code === 'service-not-allowed' ? code : 'unknown')
      releaseWakeLock()
    }

    rec.onend = () => {
      interimRef.current = ''
      updateDisplay()
      if (!intendToListenRef.current) return
      restartTimerRef.current = setTimeout(() => {
        if (!intendToListenRef.current) return
        try {
          startRecognition()
        } catch {
          // Guard against InvalidStateError
        }
      }, backoffRef.current)
    }

    try {
      rec.start()
    } catch {
      // Guard against InvalidStateError if already started
    }
  }, [updateDisplay, releaseWakeLock])

  // ── Public API ────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (!getSpeechRecognition()) {
      setError('not-supported')
      return
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    setError(null)
    intendToListenRef.current = true
    setIsListening(true)
    void acquireWakeLock()
    startRecognition()
  }, [acquireWakeLock, startRecognition])

  const stop = useCallback(() => {
    intendToListenRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    recognitionRef.current?.stop()
    recognitionRef.current = null
    interimRef.current = ''
    setIsListening(false)
    releaseWakeLock()
    updateDisplay()
  }, [releaseWakeLock, updateDisplay])

  const reset = useCallback(() => {
    stop()
    committedRef.current = ''
    interimRef.current = ''
    setDisplayTranscript('')
    setError(null)
  }, [stop])

  useEffect(() => {
    return () => {
      intendToListenRef.current = false
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      recognitionRef.current?.stop()
      releaseWakeLock()
    }
  }, [releaseWakeLock])

  return { transcript: displayTranscript, isListening, error, start, stop, reset }
}
