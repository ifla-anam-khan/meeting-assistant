export interface Env {
  DATABASE_URL: string
  OPENAI_API_KEY: string
  APP_TOKEN: string           // bearer token checked on every API request
  SKIP_AUTH: string           // 'true' in .dev.vars only; never set in production
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  REDDIT_CLIENT_ID: string    // Reddit script app — from reddit.com/prefs/apps
  REDDIT_CLIENT_SECRET: string
}
