import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from './api'
import type { Space, Session, Task, RememberItem, Contact, CaptureDetail } from './types'

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

export function useTasks(space: Space, status?: 'pending' | 'done') {
  const params = new URLSearchParams({ space })
  if (status) params.set('status', status)
  return useQuery({
    queryKey: ['tasks', space, status],
    queryFn: () => apiGet<Task[]>(`/tasks?${params}`),
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { space: Space; text: string; priority?: 'high' | 'normal'; due_date?: string }) =>
      apiPost<Task>('/tasks', body),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', task.space] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: 'pending' | 'done'; text?: string; due_date?: string | null; priority?: 'high' | 'normal' }) =>
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
