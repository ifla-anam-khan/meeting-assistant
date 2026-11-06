import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { anonymizeNames } from './nameAnonymizer'

// ── Zod schemas ────────────────────────────────────────────────────────────

const ActionItemSchema = z.object({
  text: z.string(),
  assigned_by: z.string().nullable(),
  due_date: z.string().nullable().describe('ISO date YYYY-MM-DD, or null'),
  priority: z.enum(['high', 'normal']),
  source_quote: z.string().nullable(),
})

const RememberItemSchema = z.object({
  text: z.string(),
  source_quote: z.string().nullable(),
})

const ContactSchema = z.object({
  name: z.string(),
  topic: z.string(),
  notes: z.string().nullable(),
  source_quote: z.string().nullable(),
})

export const WorkExtractionSchema = z.object({
  title: z.string().describe('Short auto-suggested meeting title based on content'),
  summary: z.string().describe('2–3 sentence TL;DR of the meeting'),
  action_items: z.array(ActionItemSchema).describe('Tasks the participants (especially "I") must do'),
  decisions: z.array(RememberItemSchema).describe('Key decisions made or facts agreed upon'),
  contacts: z.array(ContactSchema).describe('People mentioned and what they are responsible for'),
  open_questions: z.array(RememberItemSchema).describe('Unresolved questions needing follow-up'),
})

export const PersonalExtractionSchema = z.object({
  summary: z.string().describe('1–2 sentence summary of the brain-dump'),
  tasks: z.array(z.object({
    text: z.string(),
    project_hint: z.string().nullable().describe('Project name this task belongs to, or null'),
    recurrence: z.enum(['none', 'daily', 'weekly']),
    priority: z.enum(['high', 'normal']),
    source_quote: z.string().nullable(),
  })),
})

export type WorkExtraction = z.infer<typeof WorkExtractionSchema>
export type PersonalExtraction = z.infer<typeof PersonalExtractionSchema>

// ── Provider factory ───────────────────────────────────────────────────────

function getModel(apiKey: string, forChat = false) {
  const openai = createOpenAI({ apiKey })
  // Use .chat() explicitly — @ai-sdk/openai v3 defaults to the Responses API
  // (/v1/responses) which doesn't work reliably in Cloudflare Workers.
  // .chat() forces the stable Chat Completions API (/v1/chat/completions).
  return forChat
    ? openai.chat('gpt-4o')
    : openai.chat('gpt-4o-mini')
}

// ── Extract work meeting ───────────────────────────────────────────────────

function hasSpeakerLabels(transcript: string): boolean {
  return transcript.includes('[Me - speaking into mic]') || transcript.includes('[Them - system audio]')
}

export async function extractWorkMeeting(
  transcript: string,
  openaiApiKey: string,
  carryForwardQuestions: string[] = [],
): Promise<WorkExtraction> {
  const today = new Date().toISOString().split('T')[0]
  const model = getModel(openaiApiKey)
  const safeTranscript = anonymizeNames(transcript)

  const carryForwardSection = carryForwardQuestions.length > 0
    ? `\nUnresolved open questions from previous meetings (check if any were addressed):\n${carryForwardQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`
    : ''

  const speakerContext = hasSpeakerLabels(transcript)
    ? `Speaker labels are present in this transcript:
- "[Me - speaking into mic]" = the person who recorded this meeting (the user, first person "I")
- "[Them - system audio]" = the remote participant(s) on the call
Use these labels to precisely attribute action items and decisions. When "[Me]" says "I'll do X", assigned_by = null (it's the user's own task). When "[Them]" says "I'll do X", assigned_by = "Them" or their name if mentioned.`
    : `This transcript has no speaker labels. Use conversational cues (name references, "I'll take that", ownership shifts) to attribute action items. If "I" is ambiguous, set assigned_by to null.`

  const { object } = await generateObject({
    model,
    schema: WorkExtractionSchema,
    prompt: `You are a meeting-notes assistant. Extract structured information from the meeting transcript below.
Today's date is ${today}. Use it to infer due dates from phrases like "by Friday", "next week", "end of month".
${carryForwardSection}
${speakerContext}

Rules:
- action_items: extract ALL commitments made by ANY speaker
- source_quote: copy a short exact phrase from the transcript (max ~15 words), or null if none
- Keep summaries concise and factual; reflect the full conversation, not just one perspective
- Do NOT invent information not in the transcript

Transcript:
---
${safeTranscript}
---`,
    maxOutputTokens: 2048,
  })

  return object
}

// ── Extract personal brain-dump ────────────────────────────────────────────

export async function extractPersonalDump(
  transcript: string,
  openaiApiKey: string,
): Promise<PersonalExtraction> {
  const today = new Date().toISOString().split('T')[0]
  const model = getModel(openaiApiKey)
  const safeTranscript = anonymizeNames(transcript)

  const { object } = await generateObject({
    model,
    schema: PersonalExtractionSchema,
    prompt: `You are a personal task organizer. Extract individual to-dos from this voice brain-dump.
Today's date is ${today}.

Rules:
- Split compound statements into individual tasks ("gym and call bank" → two tasks)
- Detect recurrence from phrases like "every day", "weekly", "daily"
- project_hint: if the task clearly belongs to a project, name it briefly; otherwise null
- source_quote: short exact phrase from the transcript, or null

Brain-dump transcript:
---
${safeTranscript}
---`,
    maxOutputTokens: 1024,
  })

  return object
}
