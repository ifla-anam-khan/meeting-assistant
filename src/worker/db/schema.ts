import { pgTable, uuid, text, timestamp, date, integer, boolean, jsonb, real } from 'drizzle-orm/pg-core'

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

export const appLogs = pgTable('app_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  level: text('level').notNull(),    // 'error' | 'warn' | 'info'
  source: text('source').notNull(),  // route/service that emitted it
  message: text('message').notNull(),
  detail: text('detail'),            // stack trace or raw error body
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const feedSources = pgTable('feed_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  category: text('category').notNull(), // 'papers'|'labs'|'chinese'|'academic'|'news'|'newsletter'|'tools'|'community'|'policy'
  type: text('type').notNull(),         // 'rss'|'arxiv'|'hn'|'reddit'|'hf'
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(2), // 1|2|3
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const feedItems = pgTable('feed_items', {
  id: text('id').primaryKey(),           // hash of url
  sourceId: text('source_id').notNull().references(() => feedSources.id, { onDelete: 'cascade' }),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),      // raw excerpt from source
  summary: text('summary'),             // GPT-4o-mini summary
  category: text('category').notNull(),
  tags: text('tags'),                   // JSON array of strings
  importance: real('importance').notNull().default(0.5), // 0.0-1.0
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  embedding: text('embedding'),         // JSON array of 256 floats
  processed: boolean('processed').notNull().default(false),
  author: text('author'),
  extra: jsonb('extra'),               // upvotes, comments, paper_id, etc.
})

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  digestTime: text('digest_time').notNull().default('08:00'),
  digestEnabled: boolean('digest_enabled').notNull().default(true),
  digestCombined: boolean('digest_combined').notNull().default(true),
  eveningDigestEnabled: boolean('evening_digest_enabled').notNull().default(false),
  eveningDigestTime: text('evening_digest_time').notNull().default('20:00'),
})
