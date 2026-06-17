import { eq, and, lte, isNotNull, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { tasks, settings } from '../db/schema'
import type { PushPayload } from './push-send'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]!
}

function localHour(ianaZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: ianaZone }).format(
      new Date(),
    ),
  )
}

export interface DigestResult {
  shouldSend: boolean
  payload: PushPayload | null
}

const notSnoozed = or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, new Date()))

export async function buildDigest(db: Db, timezone = 'Asia/Kolkata'): Promise<DigestResult> {
  let [config] = await db.select().from(settings).where(eq(settings.id, 1))
  if (!config) {
    ;[config] = await db
      .insert(settings)
      .values({ id: 1 })
      .onConflictDoNothing()
      .returning()
    if (!config) {
      config = {
        id: 1,
        digestTime: '08:00',
        digestEnabled: true,
        digestCombined: true,
        eveningDigestEnabled: false,
        eveningDigestTime: '20:00',
      }
    }
  }

  const currentHour = localHour(timezone)

  const morningHour = Number(config.digestTime.split(':')[0])
  const eveningHour = Number(config.eveningDigestTime.split(':')[0])

  const isMorningMatch = config.digestEnabled && currentHour === morningHour
  const isEveningMatch = config.eveningDigestEnabled && currentHour === eveningHour

  if (!isMorningMatch && !isEveningMatch) return { shouldSend: false, payload: null }

  const today = todayISO()

  const [workTasks, personalTasks] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.space, 'work'),
          eq(tasks.status, 'pending'),
          lte(tasks.dueDate, today),
          notSnoozed,
        ),
      ),
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.space, 'personal'),
          eq(tasks.status, 'pending'),
          lte(tasks.dueDate, today),
          notSnoozed,
        ),
      ),
  ])

  const total = workTasks.length + personalTasks.length
  if (total === 0) return { shouldSend: false, payload: null }

  const workOverdue = workTasks.filter((t) => t.dueDate! < today).length
  const personalOverdue = personalTasks.filter((t) => t.dueDate! < today).length

  let body = ''
  if (workTasks.length > 0) {
    body += `Work: ${workTasks.length} pending${workOverdue > 0 ? ` (${workOverdue} overdue)` : ''}. `
  }
  if (personalTasks.length > 0) {
    body += `Personal: ${personalTasks.length} pending${personalOverdue > 0 ? ` (${personalOverdue} overdue)` : ''}.`
  }

  const title = isEveningMatch && !isMorningMatch
    ? `Evening wrap-up — ${total} task${total === 1 ? '' : 's'} pending`
    : `Meeting Assistant — ${total} task${total === 1 ? '' : 's'} pending`

  return {
    shouldSend: true,
    payload: {
      title,
      body: body.trim(),
      url: '/',
    },
  }
}

export async function buildDueReminders(db: Db): Promise<PushPayload[]> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000)

  const dueTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'pending'),
        isNotNull(tasks.reminderAt),
        lte(tasks.reminderAt, now),
        or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, now)),
      ),
    )

  return dueTasks
    .filter((t) => {
      if (!t.reminderAt) return false
      const reminderTime = new Date(t.reminderAt).getTime()
      return reminderTime >= windowStart.getTime() && reminderTime <= now.getTime()
    })
    .map((t) => ({
      title: 'Reminder',
      body: t.text,
      taskId: t.id,
      url: '/',
    }))
}
