import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from './api'
import type { Space, Session, Task, RememberItem, Contact, CaptureDetail, SearchResults, Project, WeeklyStats, AppLog } from './types'

// ── Remember item deletion ──────────────────────────────────────────────────

export function useDeleteRememberItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, space }: { id: string; space: Space }) => {
      void space
      return apiDelete(`/remember/${id}`)
    },
    onSuccess: (_data, { space }) => {
      queryClient.invalidateQueries({ queryKey: ['remember', space] })
    },
  })
}

// ── Contact deletion ────────────────────────────────────────────────────────

export function useDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, space }: { id: string; space: Space }) => {
      void space
      return apiDelete(`/contacts/${id}`)
    },
    onSuccess: (_data, { space }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', space] })
    },
  })
}

// ── Capture retry ───────────────────────────────────────────────────────────

export function useRetryCapture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, space }: { id: string; space: Space }) => {
      void space
      return apiPost<{ session: Session }>(`/captures/${id}/retry`, {})
    },
    onSuccess: (_data, { id, space }) => {
      queryClient.invalidateQueries({ queryKey: ['captures', id] })
      queryClient.invalidateQueries({ queryKey: ['captures', space] })
      queryClient.invalidateQueries({ queryKey: ['tasks', space] })
      queryClient.invalidateQueries({ queryKey: ['remember', space] })
      queryClient.invalidateQueries({ queryKey: ['contacts', space] })
    },
  })
}

// ── Captures ───────────────────────────────────────────────────────────────

export function useCaptures(space: Space) {
  return useQuery({
    queryKey: ['captures', space],
    queryFn: () => apiGet<Session[]>(`/captures?space=${space}`),
  })
}

export function useCapture(id: string) {
  return useQuery({
    queryKey: ['captures', id],
    queryFn: () => apiGet<CaptureDetail>(`/captures/${id}`),
    enabled: !!id,
    // Poll every 3 seconds while AI extraction is running in the background
    refetchInterval: (query) =>
      query.state.data?.session.status === 'processing' ? 3000 : false,
  })
}

export function useRenameCapture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string; space: Space }) =>
      apiPatch<Session>(`/captures/${id}`, { name }),
    onSuccess: (_data, { id, space }) => {
      queryClient.invalidateQueries({ queryKey: ['captures', id] })
      queryClient.invalidateQueries({ queryKey: ['captures', space] })
    },
  })
}

export function useDeleteCapture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, space }: { id: string; space: Space }) => {
      void space
      return apiDelete(`/captures/${id}`)
    },
    onSuccess: (_data, { space }) => {
      queryClient.invalidateQueries({ queryKey: ['captures', space] })
      queryClient.invalidateQueries({ queryKey: ['tasks', space] })
      queryClient.invalidateQueries({ queryKey: ['remember', space] })
      queryClient.invalidateQueries({ queryKey: ['contacts', space] })
    },
  })
}

export function useCreateCapture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { space: Space; transcript: string; name?: string }) =>
      apiPost<{ session: Session }>('/captures', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['captures', data.session.space] })
      queryClient.invalidateQueries({ queryKey: ['tasks', data.session.space] })
      queryClient.invalidateQueries({ queryKey: ['remember', data.session.space] })
      queryClient.invalidateQueries({ queryKey: ['contacts', data.session.space] })
    },
  })
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export function useTasks(space: Space, status?: 'pending' | 'done', projectId?: string) {
  const params = new URLSearchParams({ space })
  if (status) params.set('status', status)
  if (projectId) params.set('project_id', projectId)
  return useQuery({
    queryKey: ['tasks', space, status, projectId],
    queryFn: () => apiGet<Task[]>(`/tasks?${params}`),
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { space: Space; text: string; priority?: 'high' | 'normal'; due_date?: string; project_id?: string }) =>
      apiPost<Task>('/tasks', body),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', task.space] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: 'pending' | 'done'; text?: string; due_date?: string | null; priority?: 'high' | 'normal'; reminder_at?: string | null; snoozed_until?: string | null }) =>
      apiPatch<Task>(`/tasks/${id}`, body),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', task.space] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, space }: { id: string; space: Space }) => {
      void space // used in onSuccess
      return apiDelete(`/tasks/${id}`)
    },
    onSuccess: (_data, { space }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', space] })
    },
  })
}

// ── Remember items ─────────────────────────────────────────────────────────

export function useRememberItems(space: Space) {
  return useQuery({
    queryKey: ['remember', space],
    queryFn: () => apiGet<RememberItem[]>(`/remember?space=${space}`),
  })
}

// ── Contacts ───────────────────────────────────────────────────────────────

export function useContacts(space: Space) {
  return useQuery({
    queryKey: ['contacts', space],
    queryFn: () => apiGet<Contact[]>(`/contacts?space=${space}`),
  })
}

// ── Search ─────────────────────────────────────────────────────────────────

export function useSearch(q: string, space: Space) {
  return useQuery({
    queryKey: ['search', q, space],
    queryFn: () => apiGet<SearchResults>(`/search?q=${encodeURIComponent(q)}&space=${space}`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  })
}

// ── Projects ───────────────────────────────────────────────────────────────

export function useProjects(space: Space) {
  return useQuery({
    queryKey: ['projects', space],
    queryFn: () => apiGet<Project[]>(`/projects?space=${space}`),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { space: Space; name: string; notes?: string }) =>
      apiPost<Project>('/projects', body),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.space] })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; notes?: string; status?: 'active' | 'done' }) =>
      apiPatch<Project>(`/projects/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, space }: { id: string; space: Space }) => {
      void space // used in onSuccess
      return apiDelete(`/projects/${id}`)
    },
    onSuccess: (_data, { space }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', space] })
    },
  })
}

// ── Stats ──────────────────────────────────────────────────────────────────

export function useStats(space: Space) {
  return useQuery({
    queryKey: ['stats', space],
    queryFn: () => apiGet<WeeklyStats>(`/stats?space=${space}`),
  })
}

// ── Logs ───────────────────────────────────────────────────────────────────

export function useLogs(days = 10, level?: string) {
  const params = new URLSearchParams({ days: String(days) })
  if (level) params.set('level', level)
  return useQuery({
    queryKey: ['logs', days, level],
    queryFn: () => apiGet<AppLog[]>(`/logs?${params}`),
    staleTime: 30_000,
  })
}

export function useRecentErrors() {
  return useQuery({
    queryKey: ['logs', 1, 'error'],
    queryFn: () => apiGet<AppLog[]>('/logs?days=1&level=error'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

export function useClearLogs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete('/logs'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs'] }),
  })
}
