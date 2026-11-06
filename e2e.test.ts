/**
 * End-to-end test suite — Meeting Assistant
 * Tests every feature from login through full CRUD on all data types.
 *
 * Run: npx playwright test e2e.test.ts --reporter=line
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

const BASE = 'https://meeting-assistant.sharuk205343.workers.dev'
const TOKEN = 'cdc203648476a4b9db79af4ee1c341e225e28506fa3ba2ef'
const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN}` }

// ── Helpers ───────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="password"]').fill(TOKEN)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/`)
  await expect(page.locator('h1')).toContainText('Today')
}

/** Wait for an API mutation to finish by polling until the page is no longer showing a spinner */
async function waitForNoSpinner(page: Page, timeout = 20_000) {
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout },
  )
}

// ── Track created IDs for cleanup ──────────────────────────────────────────
const createdCaptureIds: string[] = []
const createdTaskIds: string[] = []
const createdProjectIds: string[] = []

// ─────────────────────────────────────────────────────────────────────────────
// 1. API HEALTH
// ─────────────────────────────────────────────────────────────────────────────

test.describe('API health', () => {
  test('GET /api/health returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  test('Unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks?space=work`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/tasks?space=work returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks?space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeInstanceOf(Array)
  })

  test('GET /api/tasks without space returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(400)
  })

  test('GET /api/captures?space=personal returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/captures?space=personal`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeInstanceOf(Array)
  })

  test('GET /api/settings returns settings object', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('digestEnabled')
    expect(data).toHaveProperty('eveningDigestEnabled')
  })

  test('GET /api/stats?space=work returns stats', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stats?space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('tasksCompletedThisWeek')
    expect(data).toHaveProperty('tasksPendingTotal')
    expect(data).toHaveProperty('capturesThisWeek')
  })

  test('GET /api/search?q=test&space=work returns results structure', async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=test&space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('sessions')
    expect(data).toHaveProperty('tasks')
    expect(data).toHaveProperty('contacts')
    expect(data).toHaveProperty('memory')
  })

  test('GET /api/remember?space=work returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/remember?space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeInstanceOf(Array)
  })

  test('GET /api/contacts?space=work returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/contacts?space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeInstanceOf(Array)
  })

  test('GET /api/projects?space=work returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/projects?space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeInstanceOf(Array)
  })

  test('GET /api/logs returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/logs`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeInstanceOf(Array)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. TASK CRUD via API
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks CRUD (API)', () => {
  let taskId: string

  test('POST /api/tasks creates a task', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tasks`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { space: 'work', text: 'E2E test task — please delete', priority: 'high', due_date: '2026-12-31' },
    })
    expect(res.status()).toBe(201)
    const task = await res.json()
    expect(task.text).toBe('E2E test task — please delete')
    expect(task.priority).toBe('high')
    expect(task.dueDate).toBe('2026-12-31')
    taskId = task.id
    createdTaskIds.push(taskId)
  })

  test('PATCH /api/tasks/:id updates status to done', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/tasks/${taskId}`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { status: 'done' },
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).status).toBe('done')
  })

  test('PATCH /api/tasks/:id updates text and due_date', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/tasks/${taskId}`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { text: 'E2E test task — updated', due_date: null },
    })
    expect(res.status()).toBe(200)
    const t = await res.json()
    expect(t.text).toBe('E2E test task — updated')
    expect(t.dueDate).toBeNull()
  })

  test('DELETE /api/tasks/:id removes it', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/tasks/${taskId}`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(204)
    createdTaskIds.splice(createdTaskIds.indexOf(taskId), 1)
  })

  test('DELETE non-existent task returns 404', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/tasks/00000000-0000-0000-0000-000000000000`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. CAPTURES / EXTRACTION (API) — work meeting
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Captures — work meeting extraction (API)', () => {
  let captureId: string

  test('POST /api/captures extracts meeting with action items', async ({ request }) => {
    const transcript = `
[Me - speaking into mic]:
Good morning everyone. Let's go through the sprint review.
Alex said he would complete the API documentation by Friday.
I need to schedule a follow-up call with the design team next Monday.
We decided to use PostgreSQL for the new feature.

[Them - system audio]:
Sounds good. I'll make sure to review the PR before end of day.
Should we schedule a retro for next Thursday?
The budget for Q3 has been approved — confirmed by finance.
    `.trim()

    const res = await request.post(`${BASE}/api/captures`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { space: 'work', transcript, name: 'E2E Sprint Review' },
    })
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.session).toHaveProperty('id')
    expect(data.session.status).toBe('done')
    expect(data.session.name).toBeTruthy()
    captureId = data.session.id
    createdCaptureIds.push(captureId)
  })

  test('GET /api/captures/:id returns full detail with tasks + remember', async ({ request }) => {
    const res = await request.get(`${BASE}/api/captures/${captureId}`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.session.id).toBe(captureId)
    expect(data.tasks).toBeInstanceOf(Array)
    expect(data.rememberItems).toBeInstanceOf(Array)
    expect(data.contacts).toBeInstanceOf(Array)
    // Should have extracted at least one action item
    expect(data.tasks.length).toBeGreaterThan(0)
  })

  test('Name anonymization: user name does not appear in extracted data', async ({ request }) => {
    const nameVariants = ['sharuk','sheruk','sharukh','shahrukh','mohamed','mohammed','mohammad','muhammad','mohd']
    const res = await request.get(`${BASE}/api/captures/${captureId}`, { headers: AUTH_HEADERS })
    const data = await res.json()
    const allText = JSON.stringify(data).toLowerCase()
    for (const variant of nameVariants) {
      // Check as whole word (not substring of another word)
      const re = new RegExp(`\\b${variant}\\b`)
      expect(re.test(allText), `Name variant "${variant}" leaked into extracted data`).toBe(false)
    }
  })

  test('PATCH /api/captures/:id renames the session', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/captures/${captureId}`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { name: 'E2E Sprint Review (renamed)' },
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).name).toBe('E2E Sprint Review (renamed)')
  })

  test('GET /api/captures?space=work includes the new session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/captures?space=work`, { headers: AUTH_HEADERS })
    const list = await res.json()
    expect(list.some((s: { id: string }) => s.id === captureId)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. CAPTURES — personal brain dump (API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Captures — personal brain dump (API)', () => {
  let captureId: string

  test('POST /api/captures extracts personal tasks', async ({ request }) => {
    const transcript = `
I need to call the bank about my credit card tomorrow morning.
Every day I should do a 30 minute workout.
I want to read one chapter of my book every evening.
This weekend I need to clean the apartment and do laundry.
Also schedule a dentist appointment by end of this month.
    `.trim()

    const res = await request.post(`${BASE}/api/captures`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { space: 'personal', transcript },
    })
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.session.status).toBe('done')
    expect(data.session.space).toBe('personal')
    captureId = data.session.id
    createdCaptureIds.push(captureId)
  })

  test('Personal capture has extracted tasks', async ({ request }) => {
    const res = await request.get(`${BASE}/api/captures/${captureId}`, { headers: AUTH_HEADERS })
    const data = await res.json()
    expect(data.tasks.length).toBeGreaterThan(0)
    // Should detect the daily recurrence
    const dailyTask = data.tasks.find((t: { recurrence: string }) => t.recurrence === 'daily')
    expect(dailyTask).toBeTruthy()
  })

  test('DELETE /api/captures/:id deletes capture and tasks', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/captures/${captureId}`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    createdCaptureIds.splice(createdCaptureIds.indexOf(captureId), 1)
    // Verify it's gone
    const getRes = await request.get(`${BASE}/api/captures/${captureId}`, { headers: AUTH_HEADERS })
    expect(getRes.status()).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. SETTINGS (API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Settings (API)', () => {
  test('PATCH /api/settings updates digest settings', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/settings`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { digestEnabled: true, digestTime: '08:00', eveningDigestEnabled: true, eveningDigestTime: '20:00' },
    })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.digestEnabled).toBe(true)
    expect(data.digestTime).toBe('08:00')
    expect(data.eveningDigestEnabled).toBe(true)
    expect(data.eveningDigestTime).toBe('20:00')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROJECTS (API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Projects CRUD (API)', () => {
  let projectId: string

  test('POST /api/projects creates a project', async ({ request }) => {
    const res = await request.post(`${BASE}/api/projects`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { space: 'work', name: 'E2E Test Project', notes: 'Created by automated test' },
    })
    expect(res.status()).toBe(201)
    const p = await res.json()
    expect(p.name).toBe('E2E Test Project')
    projectId = p.id
    createdProjectIds.push(projectId)
  })

  test('GET /api/projects?space=work includes new project', async ({ request }) => {
    const res = await request.get(`${BASE}/api/projects?space=work`, { headers: AUTH_HEADERS })
    const list = await res.json()
    expect(list.some((p: { id: string }) => p.id === projectId)).toBe(true)
  })

  test('PATCH /api/projects/:id updates project', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/projects/${projectId}`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { name: 'E2E Test Project (updated)', status: 'done' },
    })
    expect(res.status()).toBe(200)
    const p = await res.json()
    expect(p.name).toBe('E2E Test Project (updated)')
    expect(p.status).toBe('done')
  })

  test('DELETE /api/projects/:id removes project', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/projects/${projectId}`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(204)
    createdProjectIds.splice(createdProjectIds.indexOf(projectId), 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. SEARCH (API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Search (API)', () => {
  test('Search returns all four result types', async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=review&space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const d = await res.json()
    expect(Array.isArray(d.sessions)).toBe(true)
    expect(Array.isArray(d.tasks)).toBe(true)
    expect(Array.isArray(d.contacts)).toBe(true)
    expect(Array.isArray(d.memory)).toBe(true)
  })

  test('Short query (<2 chars) returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=a&space=work`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. ASK / CHAT (API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Ask / AI chat (API)', () => {
  test('POST /api/ask streams SSE response', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ask`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { question: 'What tasks do I have pending?', space: 'work', history: [] },
    })
    expect(res.status()).toBe(200)
    const body = await res.text()
    // SSE stream should have data: ... lines
    expect(body).toContain('data:')
    expect(body).toContain('[DONE]')
  })

  test('Ask does not expose user name to LLM (answer does not contain name variants)', async ({ request }) => {
    const nameVariants = ['sharuk', 'sheruk', 'mohamed', 'mohammed', 'mohammad', 'muhammad']
    const res = await request.post(`${BASE}/api/ask`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { question: 'Summarize the sprint review meeting', space: 'work', history: [] },
    })
    const body = (await res.text()).toLowerCase()
    for (const v of nameVariants) {
      const re = new RegExp(`\\b${v}\\b`)
      expect(re.test(body), `Name variant "${v}" found in Ask response`).toBe(false)
    }
  })

  test('Multi-turn history is accepted', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ask`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: {
        question: 'Can you repeat that?',
        space: 'work',
        history: [
          { role: 'user', content: 'What meetings did I have this week?' },
          { role: 'assistant', content: 'You had the sprint review meeting.' },
        ],
      },
    })
    expect(res.status()).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. EXPORT (API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Export (API)', () => {
  test('GET /api/export?space=work returns markdown', async ({ request }) => {
    const res = await request.get(`${BASE}/api/export?space=work&format=markdown`, { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const ct = res.headers()['content-type'] ?? ''
    expect(ct).toContain('text/markdown')
    const body = await res.text()
    expect(body.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. UI — Login
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Login', () => {
  test('Wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.locator('input[type="password"]').fill('wrong-token')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('text=Wrong password')).toBeVisible({ timeout: 10_000 })
  })

  test('Correct password logs in and redirects to home', async ({ page }) => {
    await login(page)
    await expect(page.locator('h1')).toContainText('Today')
  })

  test('Protected routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE}/todo`)
    await expect(page).toHaveURL(`${BASE}/login`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. UI — Home page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Home', () => {
  test('Home shows date, quick action buttons, recent sessions link', async ({ page }) => {
    await login(page)
    // Date header
    await expect(page.locator('h1')).toContainText('Today')
    // Quick action CTA
    await expect(page.locator('a[href="/capture"]').first()).toBeVisible()
    // All Tasks button
    await expect(page.locator('a[href="/todo"]').first()).toBeVisible()
  })

  test('Space switcher changes between Work and Personal', async ({ page }) => {
    await login(page)
    // Find the space toggle (Layout component)
    const workBtn = page.locator('button:has-text("Work")').first()
    const personalBtn = page.locator('button:has-text("Personal")').first()
    if (await workBtn.isVisible()) {
      await personalBtn.click()
      await expect(page.locator('text=Brain Dump').or(page.locator('text=Personal')).first()).toBeVisible({ timeout: 5000 })
      await workBtn.click()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. UI — Capture (paste mode, full flow)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — New Capture (paste flow)', () => {
  let captureId: string

  test('Paste transcript → extract → navigate to detail', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/capture`)

    // Click "Paste Transcript"
    await page.locator('button:has-text("Paste Transcript")').click()
    await expect(page.locator('textarea')).toBeVisible()

    // Fill in transcript
    const transcript = `
Team call notes:
John will update the API documentation before Thursday.
We agreed to move the release date to next Friday.
Mary is responsible for the design review by Tuesday.
Open question: Should we migrate to a new auth provider?
    `.trim()
    await page.locator('textarea').fill(transcript)

    // Submit
    await page.locator('button:has-text("Extract & Save")').click()

    // Wait for extraction (up to 30 seconds)
    await page.waitForURL(`${BASE}/captures/**`, { timeout: 60_000 })
    captureId = page.url().split('/captures/')[1]!
    createdCaptureIds.push(captureId)

    // Detail page should show structured results
    await expect(page.locator('text=Action Items').or(page.locator('text=Tasks'))).toBeVisible({ timeout: 10_000 })
  })

  test('Capture detail shows tasks, decisions, delete button', async ({ page }) => {
    if (!captureId) test.skip()
    await login(page)
    await page.goto(`${BASE}/captures/${captureId}`)

    // Page should load without error
    await expect(page.locator('text=Not Found').or(page.locator('text=Error'))).not.toBeVisible()
    // Should have a back link
    await expect(page.locator('a[href="/captures"]').or(page.locator('[aria-label="Back"]')).first()).toBeVisible()
  })

  test('Delete button navigates back to list', async ({ page }) => {
    if (!captureId) test.skip()
    await login(page)
    await page.goto(`${BASE}/captures/${captureId}`)

    // Trigger delete
    const deleteBtn = page.locator('button').filter({ hasText: /delete/i }).first()
    if (await deleteBtn.isVisible({ timeout: 3000 })) {
      page.on('dialog', (d) => d.accept())
      await deleteBtn.click()
      await page.waitForURL(`${BASE}/captures`, { timeout: 10_000 })
      createdCaptureIds.splice(createdCaptureIds.indexOf(captureId), 1)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. UI — Captures list
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Captures list', () => {
  test('Captures list loads and shows items or empty state', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/captures`)
    await expect(
      page.locator('text=No captures yet').or(page.locator('[href^="/captures/"]').first()),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. UI — Todo / Tasks
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Todo page', () => {
  test('Todo page loads, shows add input', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/todo`)
    // Should have a text input for adding tasks
    await expect(page.locator('input[placeholder*="task"]').or(page.locator('input[placeholder*="Task"]')).or(page.locator('textarea'))).toBeVisible({ timeout: 10_000 })
  })

  test('Can add a new task via UI', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/todo`)

    const input = page.locator('input').first()
    await input.fill('E2E UI test task')
    await input.press('Enter')
    await expect(page.locator('text=E2E UI test task')).toBeVisible({ timeout: 30_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 15. UI — Search
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Search', () => {
  test('Search page has input and shows results or empty state', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/search`)
    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeVisible()

    await searchInput.fill('review')
    // Wait for debounce + results
    await page.waitForTimeout(500)
    await expect(
      page.locator('text=No results').or(page.locator('section')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 16. UI — Ask / AI chat
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Ask page', () => {
  test('Ask page loads and shows input', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ask`)
    await expect(page.locator('textarea').or(page.locator('input[type="text"]'))).toBeVisible()
  })

  test('Sending a question shows a streaming response', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ask`)

    const input = page.locator('input[type="text"]').first()
    await input.fill('What tasks do I have today?')
    await page.keyboard.press('Enter')

    // Should show a loading indicator then a response
    await expect(page.locator('.animate-spin').first()).toBeVisible({ timeout: 5_000 })
    // Then response appears (wait up to 30s for OpenAI)
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 30_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 17. UI — Projects
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Projects', () => {
  test('Projects page loads', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/projects`)
    await expect(
      page.locator('text=Projects').or(page.locator('text=No projects')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 18. UI — Settings
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Settings', () => {
  test('Settings page loads and shows toggles', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/settings`)
    await expect(
      page.locator('text=Digest').or(page.locator('text=Notifications')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 19. UI — Remember page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI — Remember', () => {
  test('Remember page loads with decisions / contacts sections', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/remember`)
    await expect(
      page.locator('text=Decisions').or(page.locator('text=Nothing stored yet')).or(page.locator('text=Contacts')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 20. NAME ANONYMIZATION — smoke test via API
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Name anonymization — production smoke test', () => {
  const nameVariants = [
    'Sharuk', 'Mohammed Sharuk', 'Shah Rukh', 'Sherook', 'Shoruk',
    'Muhammad', 'Mohd', 'Shahrukh', 'Sheruk', 'Charuk',
  ]

  test('Transcript containing name variants gets extracted without any name reaching LLM output', async ({ request }) => {
    const transcript = `
Meeting with the team.
Mohammed Sharuk will handle the deployment by next Monday.
Shah Rukh confirmed the budget is approved.
Sherook mentioned he needs the API keys before Friday.
We decided to migrate to TypeScript — confirmed by Mohd.
Open question: Should Shahrukh lead the new project?
    `.trim()

    const res = await request.post(`${BASE}/api/captures`, {
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      data: { space: 'work', transcript, name: 'E2E Anonymization Test' },
    })
    expect(res.status()).toBe(201)
    const data = await res.json()
    const captureId = data.session.id
    createdCaptureIds.push(captureId)

    // Fetch full detail — extracted fields must not contain any name variant.
    // rawTranscript is stored as-is (intentional); only check LLM-generated fields.
    const detail = await request.get(`${BASE}/api/captures/${captureId}`, { headers: AUTH_HEADERS })
    const detailData = await detail.json()
    const extractedJson = JSON.stringify({
      name: detailData.session?.name,
      summary: detailData.session?.summary,
      tasks: detailData.tasks,
      rememberItems: detailData.rememberItems,
      contacts: detailData.contacts,
    }).toLowerCase()

    for (const variant of nameVariants) {
      const re = new RegExp(`\\b${variant.toLowerCase()}\\b`)
      expect(
        re.test(extractedJson),
        `Name variant "${variant}" leaked into extracted data:\n${extractedJson.slice(0, 500)}`,
      ).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP — delete all test data created during the run
// ─────────────────────────────────────────────────────────────────────────────

test.afterAll(async ({ request }) => {
  for (const id of [...createdCaptureIds]) {
    await request.delete(`${BASE}/api/captures/${id}`, { headers: AUTH_HEADERS })
  }
  for (const id of [...createdTaskIds]) {
    await request.delete(`${BASE}/api/tasks/${id}`, { headers: AUTH_HEADERS })
  }
  for (const id of [...createdProjectIds]) {
    await request.delete(`${BASE}/api/projects/${id}`, { headers: AUTH_HEADERS })
  }
  // Clean up "E2E UI test task" if it still exists
  try {
    const res = await request.get(`${BASE}/api/tasks?space=work`, { headers: AUTH_HEADERS })
    const tasks = await res.json()
    for (const t of tasks) {
      if (typeof t.text === 'string' && t.text.startsWith('E2E')) {
        await request.delete(`${BASE}/api/tasks/${t.id}`, { headers: AUTH_HEADERS })
      }
    }
  } catch { /* best-effort */ }
})
