import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: 'e2e.test.ts',
  timeout: 60_000,
  retries: 1,
  workers: 1,        // sequential — tests share DB state
  reporter: 'line',
  use: {
    headless: true,
    viewport: { width: 390, height: 844 },   // iPhone 14 (mobile-first app)
    baseURL: 'https://meeting-assistant.sharuk205343.workers.dev',
  },
})
