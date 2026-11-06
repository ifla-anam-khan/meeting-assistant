import { useState, useRef, useCallback, useEffect } from 'react'
import { getToken } from '@/lib/api'

export type RecorderState = 'idle' | 'recording' | 'transcribing' | 'done' | 'error'

export interface UseRecorderReturn {
  state: RecorderState
  hasSystemAudio: boolean
  liveWhisperText: string   // accurate text from rolling 30s segments (grows during recording)
  whisperTranscript: string // final complete transcript (set after stop)
  error: string | null
  start: (includeSystemAudio?: boolean) => Promise<void>
  stop: () => void
  reset: () => void
}

const SEGMENT_INTERVAL_MS = 30_000 // send a Whisper segment every 30 seconds

function pickMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

function mimeToExt(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

function makeRecorder(stream: MediaStream, chunks: Blob[]): MediaRecorder {
  const mime = pickMimeType()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
  rec.start(1000)
  return rec
}

function collectBlob(recorder: MediaRecorder, chunks: Blob[]): Promise<Blob> {
  return new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
    if (recorder.state !== 'inactive') recorder.stop()
  })
}

async function sendToWhisper(blob: Blob, token: string | null): Promise<string> {
  const ext = mimeToExt(blob.type)
  const form = new FormData()
  form.append('audio', new File([blob], `recording.${ext}`, { type: blob.type }))
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return ((await res.json()) as { transcript: string }).transcript
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [liveWhisperText, setLiveWhisperText] = useState('')
  const [whisperTranscript, setWhisperTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasSystemAudio, setHasSystemAudio] = useState(false)

  const micRecRef = useRef<MediaRecorder | null>(null)
  const sysRecRef = useRef<MediaRecorder | null>(null)
  const micChunks = useRef<Blob[]>([])
  const sysChunks = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])

  // Rolling segment state (mic-only mode)
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentBoundaryRef = useRef(0)    // chunk index where the current segment starts
  const segmentTextsRef = useRef<string[]>([])
  const segmentBusyRef = useRef(false)    // prevent overlapping segment calls

  // Screen Wake Lock — prevents iOS from killing the mic when the screen dims
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen')
      // Re-acquire after visibility change (required by the spec)
      wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null })
    } catch { /* Not supported or denied — continue without it */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release()
      wakeLockRef.current = null
    }
  }, [])

  const stopAllStreams = useCallback(() => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
  }, [])

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
  }, [])

  const start = useCallback(async (includeSystemAudio = false) => {
    setError(null)
    setLiveWhisperText('')
    setWhisperTranscript('')
    setHasSystemAudio(false)
    micChunks.current = []
    sysChunks.current = []
    segmentBoundaryRef.current = 0
    segmentTextsRef.current = []
    segmentBusyRef.current = false

    // ── Mic ─────────────────────────────────────────────────────────────
    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamsRef.current.push(micStream)
    } catch {
      setError('Microphone access denied. Allow mic in browser settings.')
      setState('error')
      return
    }
    micRecRef.current = makeRecorder(micStream, micChunks.current)

    // ── System audio (separate recorder — speaker diarization) ───────────
    if (includeSystemAudio) {
      try {
        // audio-only: no screen picker, no sharing strip
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false })
        if (displayStream.getAudioTracks().length > 0) {
          streamsRef.current.push(displayStream)
          sysRecRef.current = makeRecorder(displayStream, sysChunks.current)
          setHasSystemAudio(true)
        } else {
          displayStream.getTracks().forEach((t) => t.stop())
        }
      } catch {
        // User cancelled or browser declined audio-only capture — continue with mic only
      }
    }

    setState('recording')

    // Acquire wake lock to keep screen on and mic alive
    await acquireWakeLock()

    // ── Rolling Whisper segments (mic-only) ──────────────────────────────
    // Only in mic-only mode; two-stream mode uses full diarized Whisper at stop.
    if (!includeSystemAudio) {
      const token = getToken()
      segmentTimerRef.current = setInterval(() => {
        if (segmentBusyRef.current) return
        const chunks = micChunks.current.slice(segmentBoundaryRef.current)
        if (chunks.length < 10) return // skip if less than ~10s of audio
        segmentBusyRef.current = true
        const boundary = micChunks.current.length
        const mime = micRecRef.current?.mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: mime })
        sendToWhisper(blob, token)
          .then((text) => {
            if (text.trim()) {
              segmentTextsRef.current.push(text.trim())
              setLiveWhisperText(segmentTextsRef.current.join('\n'))
              segmentBoundaryRef.current = boundary
            }
          })
          .catch(() => { /* keep browser transcript for this segment */ })
          .finally(() => { segmentBusyRef.current = false })
      }, SEGMENT_INTERVAL_MS)
    }
  }, [])

  const stop = useCallback(() => {
    const micRec = micRecRef.current
    if (!micRec || micRec.state === 'inactive') return
    const sysRec = sysRecRef.current
    const twoStream = sysRec && sysRec.state !== 'inactive'

    clearSegmentTimer()
    releaseWakeLock()
    setState('transcribing')

    const run = async () => {
      const token = getToken()

      const blobs = await Promise.all([
        collectBlob(micRec, micChunks.current),
        ...(twoStream ? [collectBlob(sysRec!, sysChunks.current)] : []),
      ])
      stopAllStreams()
      micRecRef.current = null
      sysRecRef.current = null

      if (twoStream && blobs[1] && blobs[1].size > 1000) {
        // ── Two-stream: parallel Whisper → labeled dialogue ──────────────
        const [meText, themText] = await Promise.all([
          sendToWhisper(blobs[0]!, token),
          sendToWhisper(blobs[1], token),
        ])
        const combined =
          `[Me - speaking into mic]:\n${meText.trim()}\n\n[Them - system audio]:\n${themText.trim()}`
        setWhisperTranscript(combined)
      } else if (segmentTextsRef.current.length > 0) {
        // ── Mic-only with rolling segments: process remaining audio ───────
        const remainingChunks = micChunks.current.slice(segmentBoundaryRef.current)
        if (remainingChunks.length > 3) {
          const remainingBlob = new Blob(remainingChunks, { type: blobs[0]!.type })
          try {
            const finalText = await sendToWhisper(remainingBlob, token)
            if (finalText.trim()) segmentTextsRef.current.push(finalText.trim())
          } catch { /* ignore — use segments we have */ }
        }
        setWhisperTranscript(segmentTextsRef.current.join('\n'))
      } else {
        // ── Short recording, no segments yet — single Whisper call ────────
        const transcript = await sendToWhisper(blobs[0]!, token)
        setWhisperTranscript(transcript)
      }

      micChunks.current = []
      sysChunks.current = []
      setState('done')
    }

    run().catch(() => {
      setError('Whisper transcription failed — using browser transcript instead.')
      setState('error')
    })
  }, [clearSegmentTimer, stopAllStreams])

  const reset = useCallback(() => {
    clearSegmentTimer()
    releaseWakeLock()
    if (micRecRef.current?.state !== 'inactive') micRecRef.current?.stop()
    if (sysRecRef.current?.state !== 'inactive') sysRecRef.current?.stop()
    micRecRef.current = null
    sysRecRef.current = null
    micChunks.current = []
    sysChunks.current = []
    segmentBoundaryRef.current = 0
    segmentTextsRef.current = []
    segmentBusyRef.current = false
    stopAllStreams()
    setLiveWhisperText('')
    setWhisperTranscript('')
    setError(null)
    setHasSystemAudio(false)
    setState('idle')
  }, [clearSegmentTimer, stopAllStreams])

  useEffect(() => {
    return () => {
      clearSegmentTimer()
      releaseWakeLock()
      if (micRecRef.current?.state !== 'inactive') micRecRef.current?.stop()
      if (sysRecRef.current?.state !== 'inactive') sysRecRef.current?.stop()
      stopAllStreams()
    }
  }, [clearSegmentTimer, releaseWakeLock, stopAllStreams])

  return { state, hasSystemAudio, liveWhisperText, whisperTranscript, error, start, stop, reset }
}
