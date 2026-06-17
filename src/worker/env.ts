export interface Env {
  DATABASE_URL: string
  GEMINI_API_KEY: string
  CF_ACCESS_TEAM: string
  CF_ACCESS_AUD: string
  SKIP_AUTH: string           // 'true' in .dev.vars only; never set in production
  VAPID_PUBLIC_KEY: string    // Phase 2
  VAPID_PRIVATE_KEY: string   // Phase 2
  VAPID_SUBJECT: string       // Phase 2
}
