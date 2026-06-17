// Thin fetch wrapper around /api/*
// Key behaviour: detects Cloudflare Access session-expiry (returns opaque redirect / login HTML)
// and triggers a full-page reload so the user re-authenticates cleanly.

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  // Cloudflare Access login redirect — reload to trigger re-auth
  if (res.type === 'opaqueredirect' || res.redirected) {
    window.location.reload()
    return new Promise(() => {}) // never resolves; reload is underway
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  await apiFetch(path, { method: 'DELETE' })
}
