/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope
export {}

// ── Precache app shell ─────────────────────────────────────────────────────
// self.__WB_MANIFEST is replaced by vite-plugin-pwa with the asset manifest
precacheAndRoute(self.__WB_MANIFEST)

// ── SPA navigation fallback ────────────────────────────────────────────────
// Serve index.html for all navigation requests EXCEPT /api/* and /cdn-cgi/*
// (those go to the Worker or Cloudflare Access — never to the SPA)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/cdn-cgi\//],
  }),
)

// ── Push notifications ─────────────────────────────────────────────────────

interface PushPayload {
  title: string
  body: string
  taskId?: string
  url?: string
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload: PushPayload
  try {
    payload = event.data.json() as PushPayload
  } catch {
    payload = { title: 'Meeting Assistant', body: event.data.text() }
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { taskId: payload.taskId, url: payload.url ?? '/' },
    // "Mark done" action only when this notification is for a specific task
    actions: payload.taskId
      ? [{ action: 'done', title: 'Done ✓' }]
      : [],
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

// ── Notification click ─────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const notifData = event.notification.data as { taskId?: string; url?: string } | undefined
  const taskId = notifData?.taskId
  const openUrl = notifData?.url ?? '/'

  if (event.action === 'done' && taskId) {
    // Background mark-done — fire and forget; don't open the app
    event.waitUntil(
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
        credentials: 'include',
      }).catch(() => {
        // If PATCH fails, open the app so the user can tick it manually
        return clients.openWindow(openUrl)
      }),
    )
    return
  }

  // Body tap (or iOS which ignores actions) — focus existing window or open
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
            return (client as WindowClient).focus()
          }
        }
        return clients.openWindow(openUrl)
      }),
  )
})
