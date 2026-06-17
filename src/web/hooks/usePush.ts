import { useState, useEffect, useCallback } from 'react'
import { apiPost, apiDelete } from '@/lib/api'

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0))
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading')
  const [error, setError] = useState<string | null>(null)

  // Check current subscription state on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }

    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription(),
    ).then((sub) => {
      setState(sub ? 'subscribed' : 'unsubscribed')
    }).catch(() => {
      setState('unsubscribed')
    })
  }, [])

  const subscribe = useCallback(async (): Promise<void> => {
    if (!('serviceWorker' in navigator)) return
    setError(null)
    setState('loading')

    try {
      // Fetch VAPID public key from the server
      const res = await fetch('/api/push/vapid-public-key', { credentials: 'include' })
      if (!res.ok) {
        setError('Push notifications are not configured on the server yet.')
        setState('unsubscribed')
        return
      }
      const { key } = await res.json() as { key: string }

      // Request notification permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        setError('Notification permission was denied.')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })

      const { endpoint, keys } = sub.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }

      await apiPost('/push/subscribe', { endpoint, keys })
      setState('subscribed')
    } catch (err) {
      console.error('[usePush] subscribe error:', err)
      setError('Could not enable push notifications.')
      setState('unsubscribed')
    }
  }, [])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!('serviceWorker' in navigator)) return
    setState('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await apiDelete('/push/unsubscribe')
        await sub.unsubscribe()
      }
      setState('unsubscribed')
    } catch (err) {
      console.error('[usePush] unsubscribe error:', err)
      setState('subscribed') // rollback optimistic state
    }
  }, [])

  return { state, error, subscribe, unsubscribe }
}
