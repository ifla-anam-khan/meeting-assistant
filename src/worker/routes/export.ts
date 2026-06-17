import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import type { Env } from '../env'
import { createDb } from '../db/client'
import { sessions, tasks, rememberItems, contacts } from '../db/schema'

const app = new Hono<{ Bindings: Env }>()

// GET /api/export?format=markdown|json&space=
app.get('/', async (c) => {
  const format = c.req.query('format') ?? 'json'
  const space = c.req.query('space')

  if (!space || (space !== 'work' && space !== 'personal')) {
    return c.json({ error: 'space is required (work|personal)' }, 400)
  }
  if (format !== 'json' && format !== 'markdown') {
    return c.json({ error: 'format must be json or markdown' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)

  const [allSessions, allTasks, allRemember, allContacts] = await Promise.all([
    db.select().from(sessions).where(eq(sessions.space, space)).orderBy(desc(sessions.createdAt)),
    db.select().from(tasks).where(eq(tasks.space, space)).orderBy(desc(tasks.createdAt)),
    db.select().from(rememberItems).where(eq(rememberItems.space, space)).orderBy(desc(rememberItems.createdAt)),
    db.select().from(contacts).where(eq(contacts.space, space)).orderBy(desc(contacts.createdAt)),
  ])

  const filename = `meeting-assistant-${space}-${new Date().toISOString().split('T')[0]}`

  if (format === 'json') {
    return new Response(
      JSON.stringify({ sessions: allSessions, tasks: allTasks, rememberItems: allRemember, contacts: allContacts }, null, 2),
      {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}.json"`,
        },
      },
    )
  }

  // Markdown export
  const lines: string[] = [`# Meeting Assistant — ${space.charAt(0).toUpperCase() + space.slice(1)} Export`, `Generated: ${new Date().toISOString()}`, '']

  for (const session of allSessions) {
    const date = new Date(session.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })
    lines.push(`## ${session.name}`, `*${session.type === 'meeting' ? 'Meeting' : 'Brain dump'} · ${date}*`, '')

    if (session.summary) {
      lines.push('**Summary**', session.summary, '')
    }

    const sessionTasks = allTasks.filter((t) => t.sessionId === session.id)
    if (sessionTasks.length > 0) {
      lines.push('**Action Items**')
      for (const t of sessionTasks) {
        const check = t.status === 'done' ? '[x]' : '[ ]'
        const due = t.dueDate ? ` _(due ${t.dueDate})_` : ''
        const pri = t.priority === 'high' ? ' **[HIGH]**' : ''
        lines.push(`- ${check} ${t.text}${due}${pri}`)
      }
      lines.push('')
    }

    const sessionRemember = allRemember.filter((r) => r.sessionId === session.id)
    const decisions = sessionRemember.filter((r) => r.type === 'decision')
    const openQs = sessionRemember.filter((r) => r.type === 'open-question')

    if (decisions.length > 0) {
      lines.push('**Decisions**')
      decisions.forEach((d) => lines.push(`- ${d.text}`))
      lines.push('')
    }

    if (openQs.length > 0) {
      lines.push('**Open Questions**')
      openQs.forEach((q) => lines.push(`- ${q.text}`))
      lines.push('')
    }

    const sessionContacts = allContacts.filter((ct) => ct.sessionId === session.id)
    if (sessionContacts.length > 0) {
      lines.push('**Contacts**')
      sessionContacts.forEach((ct) => lines.push(`- **${ct.name}** — ${ct.topic}`))
      lines.push('')
    }

    lines.push('**Transcript**')
    lines.push('```')
    lines.push(session.rawTranscript)
    lines.push('```')
    lines.push('', '---', '')
  }

  // Standalone tasks (no session)
  const standaloneTasks = allTasks.filter((t) => !t.sessionId)
  if (standaloneTasks.length > 0) {
    lines.push('## Standalone Tasks', '')
    standaloneTasks.forEach((t) => {
      const check = t.status === 'done' ? '[x]' : '[ ]'
      lines.push(`- ${check} ${t.text}`)
    })
    lines.push('')
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.md"`,
    },
  })
})

export default app
