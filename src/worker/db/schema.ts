import { pgTable, uuid, text, timestamp, date, integer, boolean, jsonb } from 'drizzle-orm/pg-core'

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  space: text('space').notNull(),            // 'work' | 'personal'
  type: text('type').notNull(),              // 'meeting' | 'braindump'
  name: text('name').notNull(),
  rawTranscript: text('raw_transcript').notNull(),
  summary: text('summary'),
  status: text('status').notNull().default('done'), // 'processing' | 'done' | 'failed'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  space: text('space').notNull(),
  name: text('name').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('active'), // 'active' | 'done'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  space: text('space').notNull(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  assignedBy: text('assigned_by'),
  dueDate: date('due_date'),
  reminderAt: timestamp('reminder_at', { withTimezone: true }),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  priority: text('priority').notNull().default('normal'), // 'high' | 'normal'
  recurrence: text('recurrence').notNull().default('none'), // 'none' | 'daily' | 'weekly'
  status: text('status').notNull().default('pending'), // 'pending' | 'done'
  sourceQuote: text('source_quote'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rememberItems = pgTable('remember_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  space: text('space').notNull(),
  type: text('type').notNull(), // 'decision' | 'fact' | 'follow-up' | 'open-question'
  text: text('text').notNull(),
  sourceQuote: text('source_quote'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  space: text('space').notNull(),
  name: text('name').notNull(),
  topic: text('topic').notNull(),
  notes: text('notes'),
  sourceQuote: text('source_quote'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpoint: text('endpoint').notNull().unique(),
  keys: jsonb('keys').notNull(), // { p256dh: string, auth: string }
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  digestTime: text('digest_time').notNull().default('08:00'),
  digestEnabled: boolean('digest_enabled').notNull().default(true),
  digestCombined: boolean('digest_combined').notNull().default(true),
})
