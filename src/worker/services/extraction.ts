import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'

// ── Zod schemas ────────────────────────────────────────────────────────────

const ActionItemSchema = z.object({
  text: z.string(),
  assigned_by: z.string().nullable().optional(),
  due_date: z.string().nullable().optional().describe('ISO date YYYY-MM-DD, or null'),
  priority: z.enum(['high', 'normal']).default('normal'),
  source_quote: z.string().nullable().optional(),
})

const RememberItemSchema = z.object({
  text: z.string(),
  source_quote: z.string().nullable().optional(),
})

const ContactSchema = z.object({
  name: z.string(),
  topic: z.string(),
  notes: z.string().nullable().optional(),
  source_quote: z.string().nullable().optional(),
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
    project_hint: z.string().nullable().optional().describe('Project name this task belongs to, or null'),
    recurrence: z.enum(['none', 'daily', 'weekly']).default('none'),
    priority: z.enum(['high', 'normal']).default('normal'),
    source_quote: z.string().nullable().optional(),
  })),
})

export type WorkExtraction = z.infer<typeof WorkExtractionSchema>
export type PersonalExtraction = z.infer<typeof PersonalExtractionSchema>

// ── Provider factory ───────────────────────────────────────────────────────

function getModel(apiKey: string, forChat = false) {
  const google = createGoogleGenerativeAI({ apiKey })
  // Flash-Lite: extraction (1000 req/day free); Flash: chat (250 req/day, better synthesis)
  return forChat
    ? google('gemini-2.5-flash')
    : google('gemini-2.5-flash-lite-preview-06-17')
}

// ── Extract work meeting ───────────────────────────────────────────────────

export async function extractWorkMeeting(
  transcript: string,
  geminiApiKey: string,
  carryForwardQuestions: string[] = [],
): Promise<WorkExtraction> {
  const today = new Date().toISOString().split('T')[0]
  const model = getModel(geminiApiKey)

  const carryForwardSection = carryForwardQuestions.length > 0
    ? `\nUnresolved open questions from previous meetings (check if any were addressed):\n${carryForwardQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`
    : ''

  const { object } = await generateObject({
    model,
    schema: WorkExtractionSchema,
    prompt: `You are a meeting-notes assistant. Extract structured information from the meeting transcript below.
Today's date is ${today}. Use it to infer due dates from phrases like "by Friday", "next week", "end of month".
${carryForwardSection}
Rules:
- action_items: focus on things "I" or "we" must do; infer who if clear from context
- source_quote: copy a short exact phrase from the transcript (max ~15 words), or null if none
- Keep summaries concise and factual
- Do NOT invent information not in the transcript

Transcript:
---
${transcript}
---`,
    maxOutputTokens: 2048,
  })

  return object
}

// ── Extract personal brain-dump ────────────────────────────────────────────

export async function extractPersonalDump(
  transcript: string,
  geminiApiKey: string,
): Promise<PersonalExtraction> {
  const today = new Date().toISOString().split('T')[0]
  const model = getModel(geminiApiKey)

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
${transcript}
---`,
    maxOutputTokens: 1024,
  })

  return object
}
