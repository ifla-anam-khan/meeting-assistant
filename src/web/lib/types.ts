export type Space = 'work' | 'personal'
export type TaskStatus = 'pending' | 'done'
export type TaskPriority = 'high' | 'normal'
export type RememberType = 'decision' | 'fact' | 'follow-up' | 'open-question'

export interface Session {
  id: string
  space: Space
  type: 'meeting' | 'braindump'
  name: string
  summary: string | null
  status: string
  createdAt: string
}

export interface Task {
  id: string
  space: Space
  sessionId: string | null
  projectId: string | null
  text: string
  assignedBy: string | null
  dueDate: string | null
  reminderAt: string | null
  snoozedUntil: string | null
  priority: TaskPriority
  recurrence: 'none' | 'daily' | 'weekly'
  status: TaskStatus
  sourceQuote: string | null
  createdAt: string
  updatedAt: string
}

export interface RememberItem {
  id: string
  sessionId: string | null
  space: Space
  type: RememberType
  text: string
  sourceQuote: string | null
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  sessionId: string | null
  space: Space
  name: string
  topic: string
  notes: string | null
  sourceQuote: string | null
  createdAt: string
  updatedAt: string
}

export interface CaptureDetail {
  session: Session & { rawTranscript: string }
  tasks: Task[]
  rememberItems: RememberItem[]
  contacts: Contact[]
}

export interface SearchSession {
  id: string
  name: string
  summary: string | null
  createdAt: string
  type: 'session'
}

export interface SearchTask {
  id: string
  text: string
  priority: TaskPriority
  status: TaskStatus
  dueDate: string | null
  sessionId: string | null
  type: 'task'
}

export interface SearchContact {
  id: string
  name: string
  topic: string
  sessionId: string | null
  type: 'contact'
}

export interface SearchResults {
  sessions: SearchSession[]
  tasks: SearchTask[]
  contacts: SearchContact[]
}

export interface Project {
  id: string
  space: Space
  name: string
  notes: string | null
  status: 'active' | 'done'
  createdAt: string
  updatedAt: string
}

export interface WeeklyStats {
  tasksCompletedThisWeek: number
  tasksPendingTotal: number
  capturesThisWeek: number
  topProject: { id: string; name: string; taskCount: number } | null
}
