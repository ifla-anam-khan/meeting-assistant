import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MicIcon, MicOffIcon, ClipboardPasteIcon, RotateCcwIcon, SendIcon, AlertCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useSpeech } from '@/hooks/useSpeech'
import { useCreateCapture } from '@/lib/hooks'

export default function NewCapture() {
  const { space } = useAppStore()
  const isWork = space === 'work'
  const navigate = useNavigate()

  const { transcript, isListening, error: speechError, start, stop, reset } = useSpeech()
  const createCapture = useCreateCapture()

  const [editableTranscript, setEditableTranscript] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [mode, setMode] = useState<'idle' | 'recording' | 'edit'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLTextAreaElement>(null)

  // Sync live speech into the editable textarea while recording
  useEffect(() => {
    if (mode === 'recording') {
      setEditableTranscript(transcript)
      if (transcriptRef.current) {
        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
      }
    }
  }, [transcript, mode])

  useEffect(() => {
    return () => { stop() }
  }, [stop])

  const handleStartRecording = () => {
    reset()
    setEditableTranscript('')
    setSessionName('')
    setSubmitError(null)
    setMode('recording')
    start()
  }

  const handleStopRecording = () => {
    stop()
    setMode('edit')
  }

  const handleSwitchToPaste = () => {
    stop()
    reset()
    setEditableTranscript('')
    setSessionName('')
    setSubmitError(null)
    setMode('edit')
  }

  const handleReset = () => {
    stop()
    reset()
    setEditableTranscript('')
    setSessionName('')
    setMode('idle')
    setSubmitError(null)
  }

  const canSubmit = editableTranscript.trim().length > 10
  const isExtracting = createCapture.isPending

  const handleExtractAndSave = async () => {
    if (!canSubmit || isExtracting) return
    setSubmitError(null)
    try {
      const result = await createCapture.mutateAsync({
        space,
        transcript: editableTranscript.trim(),
        name: sessionName.trim() || undefined,
      })
      navigate(`/captures/${result.session.id}`)
    } catch {
      setSubmitError('Extraction failed. Check your connection and try again.')
    }
  }

  const accentText = isWork ? 'text-indigo-600' : 'text-emerald-600'
  const accentBg = isWork ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
  const accentRing = isWork ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'

  return (
    <div className="flex flex-col p-4 gap-4 max-w-2xl mx-auto min-h-full">
      {/* Header */}
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
            onClick={handleStartRecording}
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
            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-medium text-base border border-border text-foreground bg-card transition-all active:scale-95"
          >
            <ClipboardPasteIcon size={20} />
            Paste Transcript
          </button>
        </div>
      )}

      {/* ── Recording / Edit ── */}
      {(mode === 'recording' || mode === 'edit') && (
        <>
          {/* Recording indicator */}
          {mode === 'recording' && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className={cn(
                  'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                  isWork ? 'bg-indigo-400' : 'bg-emerald-400',
                )} />
                <span className={cn(
                  'relative inline-flex rounded-full h-3 w-3',
                  isWork ? 'bg-indigo-600' : 'bg-emerald-600',
                )} />
              </span>
              <span className={cn('text-sm font-medium', accentText)}>
                {isListening ? 'Recording…' : 'Starting microphone…'}
              </span>
            </div>
          )}

          {/* Speech error */}
          {speechError && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
              <span>
                {speechError === 'not-allowed' || speechError === 'service-not-allowed'
                  ? 'Microphone access denied. Allow mic in browser settings, then try again.'
                  : speechError === 'not-supported'
                    ? 'Web Speech API is not supported on this browser (use Android Chrome).'
                    : 'Microphone error. Stop and try again.'}
              </span>
            </div>
          )}

          {/* Transcript textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {mode === 'recording' ? 'Live transcript (editable)' : 'Transcript — edit before saving'}
            </label>
            <textarea
              ref={transcriptRef}
              value={editableTranscript}
              onChange={(e) => setEditableTranscript(e.target.value)}
              rows={10}
              placeholder={
                mode === 'recording'
                  ? isListening ? 'Listening — transcript appears here…' : 'Starting microphone…'
                  : isWork
                    ? 'Paste meeting transcript here…'
                    : "What's on your mind? Tasks, ideas, projects…"
              }
              className={cn(
                'w-full rounded-xl border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2',
                accentRing,
              )}
            />
          </div>

          {/* Meeting name (Work) */}
          {isWork && (
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
            {mode === 'recording' ? (
              <button
                onClick={handleStopRecording}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card font-medium text-sm text-foreground transition-all active:scale-95"
              >
                <MicOffIcon size={18} />
                Stop
              </button>
            ) : null}

            <button
              onClick={handleExtractAndSave}
              disabled={!canSubmit || isExtracting}
              className={cn(
                'flex items-center justify-center gap-2 flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-95',
                canSubmit && !isExtracting
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
              Keep the screen on and app in foreground during recording.
              A brief beep between restarts is normal on Android.
            </p>
          )}
        </>
      )}
    </div>
  )
}
