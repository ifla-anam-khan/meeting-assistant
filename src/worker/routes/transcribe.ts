import { Hono } from 'hono'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { writeLog } from '../services/logger'

const app = new Hono<{ Bindings: Env }>()

app.post('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const t0 = Date.now()

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    void writeLog(db, 'warn', 'transcribe', 'Received invalid form data — not multipart?')
    return c.json({ error: 'Invalid request' }, 400)
  }

  const audio = form.get('audio') as File | null
  if (!audio || audio.size === 0) {
    void writeLog(db, 'warn', 'transcribe', 'Received request with missing or empty audio file')
    return c.json({ error: 'Missing audio' }, 400)
  }

  const MAX_SIZE_MB = 24
  if (audio.size > MAX_SIZE_MB * 1_048_576) {
    const mb = (audio.size / 1_048_576).toFixed(1)
    void writeLog(db, 'warn', 'transcribe', `Audio too large: ${mb} MB (limit ${MAX_SIZE_MB} MB)`)
    return c.json({ error: `Audio file is too large (${mb} MB). Please keep recordings under ${MAX_SIZE_MB} MB.` }, 413)
  }

  const sizeMB = (audio.size / 1_048_576).toFixed(2)
  const mime = audio.type || 'audio/webm'
  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'mp4'
    : mime.includes('ogg') ? 'ogg'
    : mime.includes('wav') ? 'wav'
    : 'webm'

  void writeLog(db, 'info', 'transcribe', `Audio received: ${sizeMB} MB, ${mime} — sending to Whisper`)

  const body = new FormData()
  body.append('file', new File([audio], `recording.${ext}`, { type: mime }))
  body.append('model', 'whisper-1')
  body.append('language', 'en')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.env.OPENAI_API_KEY}` },
    body,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    void writeLog(db, 'error', 'transcribe', `Whisper API error ${res.status} after ${Date.now() - t0}ms`, detail)
    return c.json({ error: 'Transcription failed' }, 502)
  }

  const data = await res.json() as { text: string }
  const elapsed = Date.now() - t0
  const chars = data.text.length
  void writeLog(db, 'info', 'transcribe', `Whisper complete: ${chars} chars in ${elapsed}ms (audio was ${sizeMB} MB)`)

  return c.json({ transcript: data.text })
})

export default app
