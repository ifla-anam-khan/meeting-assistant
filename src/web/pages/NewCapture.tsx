import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MicIcon, MicOffIcon, ClipboardPasteIcon, RotateCcwIcon,
  SendIcon, AlertCircleIcon, Loader2Icon, PencilIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useSpeech } from '@/hooks/useSpeech'
import { useRecorder } from '@/hooks/useRecorder'
import { useCreateCapture } from '@/lib/hooks'

function formatElapsed(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface SpeakerSegment { speaker: 'me' | 'them'; text: string }

function parseSpeakerTranscript(text: string): SpeakerSegment[] | null {
  if (!text.includes('[Me - speaking into mic]') && !text.includes('[Them - system audio]')) return null
  const parts = text.split(/\[(Me - speaking into mic|Them - system audio)\]:\n?/)
  const segments: SpeakerSegment[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i] ?? ''
    const body = (parts[i + 1] ?? '').trim()
    if (body) segments.push({ speaker: label.startsWith('Me') ? 'me' : 'them', text: body })
  }
  return segments.length > 0 ? segments : null
}

function DialoguePreview({ segments, isWork }: { segments: SpeakerSegment[]; isWork: boolean }) {
  const meBg = isWork ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3 max-h-80 overflow-y-auto">
      {segments.map((seg, i) => (
        <div key={i} className={cn('flex flex-col gap-0.5', seg.speaker === 'me' ? 'items-end' : 'items-start')}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {seg.speaker === 'me' ? 'Me' : 'Them'}
          </span>
          <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed', seg.speaker === 'me' ? meBg : 'bg-muted text-foreground')}>
            {seg.text}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function NewCapture() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const navigate = useNavigate()

  // Web Speech API — live display only
  const { transcript: liveTranscript, isListening, error: speechError, start: startSpeech, stop: stopSpeech, reset: resetSpeech } = useSpeech()
  // MediaRecorder → Whisper — accurate transcript for the LLM
  const { state: recState, hasSystemAudio, liveWhisperText, whisperTranscript, error: recError, start: startRec, stop: stopRec, reset: resetRec } = useRecorder()

  const createCapture = useCreateCapture()

  const [editableTranscript, setEditableTranscript] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [mode, setMode] = useState<'idle' | 'recording' | 'transcribing' | 'edit'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [rawEdit, setRawEdit] = useState(false)
  const [backgroundWarning, setBackgroundWarning] = useState(false)
  const [silenceWarning, setSilenceWarning] = useState(false)
  const transcriptRef = useRef<HTMLTextAreaElement>(null)
  const prevLiveWhisperRef = useRef('')
  const lastActivityRef = useRef(Date.now())
  const autoSaveAfterStopRef = useRef(false)
  // Keep a ref to handleExtractAndSave so the auto-save effect always sees the latest version
  const handleExtractAndSaveRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Elapsed timer
  useEffect(() => {
    if (mode !== 'recording') { setElapsed(0); return }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [mode])

  // While recording: mirror the combined Whisper-accurate prefix + live browser speech
  useEffect(() => {
    if (mode !== 'recording') return
    const prefix = liveWhisperText ? liveWhisperText + '\n' : ''
    setEditableTranscript(prefix + liveTranscript)
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [liveTranscript, liveWhisperText, mode])

  // When a new Whisper segment arrives during recording, reset browser speech so it
  // covers only the next 30-second window (the previous window is now in liveWhisperText).
  useEffect(() => {
    if (mode !== 'recording' || liveWhisperText === prevLiveWhisperRef.current) return
    prevLiveWhisperRef.current = liveWhisperText
    resetSpeech()
    startSpeech()
  }, [liveWhisperText, mode, resetSpeech, startSpeech])

  // When Whisper finishes: replace textarea with the accurate transcript
  useEffect(() => {
    if (!whisperTranscript) return
    setEditableTranscript(whisperTranscript)
    setMode('edit')
  }, [whisperTranscript])

  // Whisper error: fall back to the Web Speech transcript and let the user edit
  useEffect(() => {
    if (recState === 'error' && mode === 'transcribing') {
      setMode('edit')
    }
  }, [recState, mode])

  // Detect page going to background during recording — mic will likely pause on iOS
  useEffect(() => {
    if (mode !== 'recording') {
      setBackgroundWarning(false)
      return
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') setBackgroundWarning(true)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [mode])

  // Auto-stop after 5 minutes of silence — reset timer whenever transcript grows
  useEffect(() => {
    if (mode !== 'recording' || !editableTranscript.trim()) return
    lastActivityRef.current = Date.now()
    setSilenceWarning(false)
  }, [editableTranscript, mode])

  useEffect(() => {
    if (mode !== 'recording') {
      setSilenceWarning(false)
      return
    }
    lastActivityRef.current = Date.now()
    const WARN_MS = 4 * 60 * 1000   // show warning at 4 min
    const STOP_MS = 5 * 60 * 1000   // auto-stop at 5 min
    const id = setInterval(() => {
      const silence = Date.now() - lastActivityRef.current
      if (silence >= STOP_MS) {
        autoSaveAfterStopRef.current = true
        // Stop recording — Whisper will run, then the effect below saves automatically
        stopSpeech()
        stopRec()
        setMode('transcribing')
      } else if (silence >= WARN_MS) {
        setSilenceWarning(true)
      }
    }, 30_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // After auto-stop: when mode reaches 'edit', trigger extract+save automatically
  useEffect(() => {
    handleExtractAndSaveRef.current = handleExtractAndSave
  })
  useEffect(() => {
    if (mode !== 'edit' || !autoSaveAfterStopRef.current) return
    autoSaveAfterStopRef.current = false
    if (editableTranscript.trim().length > 10) {
      void handleExtractAndSaveRef.current()
    } else {
      setMode('idle') // nothing to save
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    return () => { stopSpeech(); resetRec() }
  }, [stopSpeech, resetRec])

  const handleStartRecording = async (includeSystemAudio = false) => {
    prevLiveWhisperRef.current = ''
    resetSpeech()
    resetRec()
    setEditableTranscript('')
    setSessionName('')
    setSubmitError(null)
    setRawEdit(false)
    try {
      // Acquire mic/stream permissions BEFORE setting mode='recording'.
      // The permission dialog briefly fires visibilitychange='hidden', which would
      // trigger the background warning falsely if the listener were already active.
      await startRec(includeSystemAudio)
      setMode('recording')
      startSpeech()
    } catch (err) {
      setMode('idle')
      stopSpeech()
      resetRec()
      const msg = err instanceof Error ? err.message : 'Could not start recording'
      setSubmitError(msg.includes('Permission') || msg.includes('permission')
        ? 'Microphone access denied. Please allow microphone access and try again.'
        : `Could not start recording: ${msg}`)
    }
  }

  const handleStopRecording = () => {
    stopSpeech()
    stopRec()              // triggers Whisper in background
    // editableTranscript already shows liveWhisperText + liveTranscript from the sync effect
    setMode('transcribing')
  }

  const handleSwitchToPaste = () => {
    stopSpeech()
    resetRec()
    resetSpeech()
    setEditableTranscript('')
    setSessionName('')
    setSubmitError(null)
    setMode('edit')
  }

  const handleReset = () => {
    stopSpeech()
    resetRec()
    resetSpeech()
    setEditableTranscript('')
    setSessionName('')
    setMode('idle')
    setSubmitError(null)
  }

  const canSubmit = editableTranscript.trim().length > 10
  const isExtracting = createCapture.isPending
  const isTranscribing = mode === 'transcribing'

  const handleExtractAndSave = async () => {
    if (!canSubmit || isExtracting) return
    setSubmitError(null)
    try {
      const result = await createCapture.mutateAsync({
        space,
        transcript: editableTranscript.trim(),
        name: sessionName.trim() || undefined,
      })
      // Server returns 202 immediately — extraction runs in background.
      // Navigate to the detail page which polls until status changes to done/failed.
      navigate(`/captures/${result.session.id}`)
    } catch {
      setSubmitError('Could not save capture. Check your connection and try again.')
    }
  }

  const accentText = isWork ? 'text-indigo-600' : 'text-emerald-600'
  const accentBg = isWork ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
  const accentRing = isWork ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'
  const accentPing = isWork ? 'bg-indigo-400' : 'bg-emerald-400'
  const accentDot = isWork ? 'bg-indigo-600' : 'bg-emerald-600'

  return (
    <div className="flex flex-col p-4 gap-4 max-w-2xl mx-auto min-h-full">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {isWork ? 'New Meeting Capture' : 'Brain Dump'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isWork
            ? 'Record or paste a transcript to extract action items and decisions.'
            : 'Talk out your tasks, ideas, and plans — AI will organize them.'}
        </p>
      </div>

      {/* ── Idle ── */}
      {mode === 'idle' && (
        <div className="flex flex-col gap-3 flex-1 justify-center pb-10">
          <button
            onClick={() => void handleStartRecording(true)}
            className={cn(
              'flex items-center justify-center gap-3 w-full py-5 rounded-2xl font-semibold text-base text-white transition-all active:scale-95',
              accentBg,
            )}
          >
            <MicIcon size={24} />
            Start Recording
          </button>
          <button
            onClick={handleSwitchToPaste}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-2xl font-medium text-sm border border-border text-muted-foreground bg-card transition-all active:scale-95"
          >
            <ClipboardPasteIcon size={18} />
            Paste Transcript
          </button>
        </div>
      )}

      {/* ── Recording / Transcribing / Edit ── */}
      {(mode === 'recording' || mode === 'transcribing' || mode === 'edit') && (
        <>
          {/* Recording indicator */}
          {mode === 'recording' && (
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', accentPing)} />
                <span className={cn('relative inline-flex rounded-full h-3 w-3', accentDot)} />
              </span>
              <span className={cn('text-sm font-medium tabular-nums', accentText)}>
                {isListening
                  ? `Recording… ${formatElapsed(elapsed)}${hasSystemAudio ? ' · Mic + System Audio' : ''}`
                  : 'Starting…'}
              </span>
            </div>
          )}

          {/* Background warning — mic likely paused */}
          {backgroundWarning && mode === 'recording' && (
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5">
              <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>App went to background</strong> — the microphone may have paused on this device.
                Keep this screen open and visible while recording.
              </span>
            </div>
          )}

          {/* Silence auto-stop warning */}
          {silenceWarning && mode === 'recording' && (
            <div className="flex items-center justify-between gap-2 text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <AlertCircleIcon size={16} className="shrink-0" />
                <span>No speech detected for 4 min — auto-stopping in 1 min.</span>
              </div>
              <button
                onClick={() => { lastActivityRef.current = Date.now(); setSilenceWarning(false) }}
                className="shrink-0 text-xs font-semibold underline"
              >
                Keep recording
              </button>
            </div>
          )}

          {/* Whisper enhancing indicator */}
          {mode === 'transcribing' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon size={15} className="animate-spin shrink-0" />
              Enhancing with Whisper…
            </div>
          )}

          {/* Errors */}
          {(speechError || recError) && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
              <span>
                {recError ?? (
                  speechError === 'not-allowed' || speechError === 'service-not-allowed'
                    ? 'Microphone access denied. Allow mic in browser settings.'
                    : speechError === 'not-supported'
                      ? 'Live preview unavailable on this browser — Whisper will still transcribe after stop.'
                      : 'Microphone error. Stop and try again.'
                )}
              </span>
            </div>
          )}

          {/* Transcript area */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {mode === 'recording'
                  ? liveWhisperText ? 'Live preview (Whisper + browser)' : 'Live preview (browser)'
                  : mode === 'transcribing'
                    ? 'Processing final Whisper pass…'
                    : 'Transcript (Whisper)'}
              </label>
              {/* Toggle between dialogue preview and raw edit */}
              {mode === 'edit' && parseSpeakerTranscript(editableTranscript) && (
                <button
                  onClick={() => setRawEdit((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <PencilIcon size={11} />
                  {rawEdit ? 'Show preview' : 'Edit raw'}
                </button>
              )}
            </div>

            {/* Dialogue bubble view (edit mode, speaker labels present, not in raw-edit) */}
            {mode === 'edit' && !rawEdit && (() => {
              const segments = parseSpeakerTranscript(editableTranscript)
              return segments ? <DialoguePreview segments={segments} isWork={isWork} /> : null
            })()}

            {/* Raw textarea — always shown during recording/transcribing; shown in edit if no labels or rawEdit */}
            {(mode !== 'edit' || rawEdit || !parseSpeakerTranscript(editableTranscript)) && (
              <textarea
                ref={transcriptRef}
                value={editableTranscript}
                onChange={(e) => setEditableTranscript(e.target.value)}
                disabled={mode === 'recording' || mode === 'transcribing'}
                rows={mode === 'recording' ? 14 : 10}
                placeholder={
                  mode === 'recording'
                    ? isListening ? 'Listening — live transcript appears here…' : 'Starting microphone…'
                    : mode === 'transcribing'
                      ? 'Enhancing with Whisper…'
                      : isWork
                        ? 'Paste meeting transcript here…'
                        : "What's on your mind? Tasks, ideas, projects…"
                }
                className={cn(
                  'w-full rounded-xl border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed',
                  accentRing,
                )}
              />
            )}
          </div>

          {/* Meeting name (Work, edit only) */}
          {isWork && mode === 'edit' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Meeting name <span className="normal-case font-normal">(optional — AI will suggest one)</span>
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Q2 planning sync"
                className={cn(
                  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2',
                  accentRing,
                )}
              />
            </div>
          )}

          {/* Submission error */}
          {submitError && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pb-2">
            {mode === 'recording' && (
              <button
                onClick={handleStopRecording}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card font-medium text-sm text-foreground transition-all active:scale-95"
              >
                <MicOffIcon size={18} />
                Stop
              </button>
            )}

            {(mode === 'transcribing' || mode === 'edit') && (
              <button
                onClick={handleExtractAndSave}
                disabled={!canSubmit || isExtracting || isTranscribing}
                className={cn(
                  'flex items-center justify-center gap-2 flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-95',
                  canSubmit && !isExtracting && !isTranscribing
                    ? accentBg
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                {isExtracting ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Extracting…
                  </>
                ) : (
                  <>
                    <SendIcon size={18} />
                    Extract & Save
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleReset}
              title="Start over"
              className="p-3 rounded-xl border border-border bg-card text-muted-foreground transition-all active:scale-95"
            >
              <RotateCcwIcon size={18} />
            </button>
          </div>

          {mode === 'recording' && (
            <p className="text-xs text-muted-foreground text-center -mt-2">
              {liveWhisperText
                ? 'Older speech cleaned up by Whisper · recent speech uses browser preview'
                : 'Live preview uses browser speech · Whisper cleans it up every 30 s and at the end'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
