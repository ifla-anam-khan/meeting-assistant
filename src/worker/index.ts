// Cloudflare Worker entry — Phase 1.A stub
// Phase 1.C will add: Hono router, Access JWT middleware, extraction service, API routes

export interface Env {
  // Phase 1.B: DATABASE_URL (Neon pooled), DATABASE_URL_UNPOOLED
  // Phase 1.C: GEMINI_API_KEY, LLM_PROVIDER
  // Phase 2:   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
}

export default {
  async fetch(_req: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response('Meeting Assistant Worker — API routes not yet implemented.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  },

  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Phase 2: hourly cron — compute local 8am, send digest + due-task push notifications
  },
}
