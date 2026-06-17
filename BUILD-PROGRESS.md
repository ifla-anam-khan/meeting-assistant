# BUILD PROGRESS — Meeting & Life Assistant

> **Living state file. Every skill/agent MUST read this first and update it after each unit of work.**
> Companion docs: [meeting-assistant-plan.md](meeting-assistant-plan.md) (what to build) · [meeting-assistant-research.md](meeting-assistant-research.md) (how/with what — the build contract).
> Last updated: 2026-06-17 · Current phase: **Phase 1.A–1.D complete ✅ | Phase 2 complete ✅ | Phase 1.E (Integration & deploy) — next**

## How to use this file
1. Read **Current Status** + **Next Action** below.
2. Do the next unfilled task(s).
3. Tick the checkbox, set the task's status, and append a dated line to the **Work Log**.
4. If you make a decision or hit a blocker, record it in **Decisions** / **Blockers**.
5. Update **Last updated** + **Current phase** at the top.

Status legend: ⬜ todo · 🟦 in progress · ✅ done · ⛔ blocked · ⏭️ deferred

---

## Current Status
- ✅ Plan finalized (all features + workspaces).
- ✅ Technical research complete and verified (see research doc §9 Final Stack).
- ✅ **Phase 1.A complete** — project scaffolded, builds clean, committed to git.
- ✅ **Phase 1.B complete** — Drizzle schema (7 tables), DB client, drizzle.config.ts written. Migration ready to apply once Neon credentials available.
- ✅ **Phase 1.C complete** — Hono app + Access JWT middleware + extraction service (Vercel AI SDK `generateObject` + Zod) + all 4 API routes (captures/tasks/remember/contacts).
- ✅ **Phase 1.D complete** — TanStack Query hooks, `useSpeech` hook (restart loop + wake lock), NewCapture page (record + paste + extract), Home/Today, Todo (tick/delete/add), Remember, CapturesList, CaptureDetail. Build clean: 344 KB JS.
- ✅ **Phase 2 complete** — Web Push (subscribe/unsubscribe, VAPID, service worker push handler + notificationclick), cron digest (local-8am check + due reminders), search (`/api/search` ILIKE across sessions/tasks/contacts), Ask chat (`/api/ask` streamText SSE + full streaming UI), export (`/api/export?format=markdown|json&space=`), settings API. Build clean: 354 KB JS.

## Next Action
> **Phase 1.E — Integration & deploy (Tasks 1.17–1.18)**
> 
> All code is complete. User must complete these steps to go live:
> 1. Create Neon project → copy `DATABASE_URL` + `DATABASE_URL_UNPOOLED`
> 2. Run `DATABASE_URL_UNPOOLED=<url> npx drizzle-kit migrate` to apply the first migration
> 3. Create Cloudflare account → `npx wrangler login`
> 4. Run `npx wrangler deploy` to get a hostname
> 5. Configure Cloudflare Access (Google IdP + single-email policy for `sharuk205343@gmail.com`)
> 6. Run `wrangler secret put` for `GEMINI_API_KEY`, `DATABASE_URL`, `CF_ACCESS_TEAM`, `CF_ACCESS_AUD`
> 7. Generate VAPID keys: `npx web-push generate-vapid-keys`
> 8. `wrangler secret put VAPID_PRIVATE_KEY` + set `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` (your email)
> 9. Set `.dev.vars` locally: `DATABASE_URL=<pooled>`, `GEMINI_API_KEY=<key>`, `SKIP_AUTH=true`
> 10. `wrangler dev` → test capture → verify all screens → `wrangler deploy`

---

## Decisions (locked — from research §0 + §9)
- **One Cloudflare Worker** serves SPA (static assets) + API (Hono) + Cron. NOT Pages + separate Worker.
- **Vite React-TS SPA** + vite-plugin-pwa (`autoUpdate`) + React Router (declarative) + Zustand (`persist`) + TanStack Query (server data) + Tailwind v4 + shadcn/ui.
- **Neon Postgres** + `@neondatabase/serverless` (HTTP) + **Drizzle** ORM. Migrations via drizzle-kit (unpooled URL); runtime pooled URL.
- **LLM via Vercel AI SDK** — `generateObject` (extraction, Gemini 2.5 Flash-Lite) + `streamText`/`generateText` (chat, Gemini 2.5 Flash). Provider-swappable via `create*({apiKey})` factories from `env`. Validate output with Zod.
- **Web Speech API** custom hook for live transcription; paste fallback.
- **Web Push** via `web-push` + `nodejs_compat` (fallback PushForge); **Cron** hourly → local-8am digest check.
- **Cloudflare Access** gates to a single email; validate `Cf-Access-Jwt-Assertion` with `jose`.
- **Chat** = SQL/keyword filter → stuff rows into prompt. No vector DB.
- Workspace (Work/Personal) is **app state**, not a route.

## Open questions to confirm with user (non-blocking for scaffolding)
- Exact deploy hostname / Cloudflare account team name (needed for Access + wrangler config).
- Confirm which LLM key to load first (Gemini free is the default).

---

## USER-ACTION ITEMS (manual steps only the user can do)
Mark ✅ when done. Needed before the matching build task can be completed end-to-end.
- ⬜ Create **Cloudflare account** + install/login `wrangler` (`npx wrangler login`).
- ⬜ Create **Neon project**; copy **pooled** `DATABASE_URL` + **unpooled** `DATABASE_URL_UNPOOLED`.
- ⬜ Create **Gemini API key** (Google AI Studio, free tier).
- ⬜ Generate **VAPID keys** (`npx web-push generate-vapid-keys`).
- ⬜ Configure **Cloudflare Access**: Google IdP + self-hosted app + Allow-policy for `sharuk205343@gmail.com` (after first deploy gives a hostname).
- ⬜ Provide secrets to Worker: `wrangler secret put GEMINI_API_KEY / DATABASE_URL / VAPID_PRIVATE_KEY` (+ `.dev.vars` locally).

---

## PHASE 1 — Core loop (both spaces)  [status: ⬜ not started]
Goal: installable PWA, workspace switcher, capture (record/paste)→extract→save, core read screens, data in Neon, behind Access. (Reminders/chat/projects = Phase 2.)

### 1.A Project setup
- ✅ **1.1** Scaffold Vite React-TS app; init git; `.gitignore`.
- ✅ **1.2** Tailwind v4 (`@tailwindcss/vite`) + shadcn CSS variables + `cn()` util; base layout + theme.
- ✅ **1.3** vite-plugin-pwa (`autoUpdate`); manifest + 192/512/maskable icons; SW excludes `/api/` + `/cdn-cgi/`.
- ✅ **1.4** React Router v7 (8 routes) + Layout shell with Work/Personal switcher (Zustand `persist`).
- ✅ **1.5** `wrangler.jsonc`: static assets SPA fallback, `nodejs_compat`, hourly cron, worker stub typed with `@cloudflare/workers-types`.

### 1.B Data layer
- ✅ **1.6** Drizzle schema for: Session, Task, RememberItem, Contact, Project, PushSubscription, Settings (see plan §6). Include `space`, timestamps, nullable FKs.
- ✅ **1.7** drizzle.config.ts; DB client (neon-http, pooled URL). ⚠️ Migration not yet applied — needs `DATABASE_URL_UNPOOLED` from Neon.

### 1.C Backend (Worker)
- ✅ **1.8** Hono app in Worker `fetch`; `/api/health`; global error handler (never leaks raw errors).
- ✅ **1.9** Access auth middleware — validate `Cf-Access-Jwt-Assertion` (jose); `SKIP_AUTH=true` in `.dev.vars` for local dev.
- ✅ **1.10** Extraction service: Vercel AI SDK `generateObject` + Zod schema (4 categories + TL;DR + priority + auto due dates). `createGoogleGenerativeAI({ apiKey })` factory from `env`.
- ✅ **1.11** API routes: `POST /api/captures`, `GET /api/captures`, `GET /api/captures/:id`, `GET /api/tasks`, `PATCH /api/tasks/:id`, `POST /api/tasks`, `DELETE /api/tasks/:id`, `GET /api/remember`, `GET /api/contacts`.

### 1.D Frontend screens (per space)
- ✅ **1.12** TanStack Query hooks (`src/web/lib/hooks.ts`) for captures, tasks, remember, contacts; Access session-expiry handled in `api.ts` (`redirect:'manual'` → full reload).
- ✅ **1.13** **New Capture**: Work = live record + paste; Personal = voice brain-dump. Editable transcript → extract & save → navigate to CaptureDetail.
- ✅ **1.14** `useSpeech` hook: restart loop, committed/interim dedup, exponential backoff on network error, fatal-error stop, wake lock + re-acquire on visibilitychange.
- ✅ **1.15** **Home/Today** (overdue/today/upcoming sections), **To-Do** (tick/delete, priority+due sort, pending/done tabs), **Remember** (4 sections + contacts), **Captures list** (TL;DR cards), **Capture detail** (summary + action items + decisions + contacts + open questions + transcript toggle).
- ✅ **1.16** Quick manual add (+) in Todo page (text + priority, Enter to submit).

### 1.E Integration & deploy
- ⬜ **1.17** End-to-end local test: record/paste → extract → save → appears on all screens, both spaces isolated.
- ⬜ **1.18** First deploy (`wrangler deploy`); then user configures Access; set secrets; verify gated + working on the Samsung phone (install to home screen, mic permission, capture).

**Phase 1 done when:** installed PWA, switch Work/Personal, capture by voice or paste, extraction populates the 4 categories + TL;DR + priority + due dates, all read screens work, data persists in Neon, app gated to the single email.

---

## PHASE 2 — Genuinely useful  [status: ✅ complete]
- ✅ Web Push setup (SW push + notificationclick, subscribe flow, store subscription, usePush hook, Settings UI).
- ✅ Cron Worker: hourly local-8am **combined digest** (Work/Personal sections) + due-reminder sends.
- ✅ Per-item reminders (`reminderAt`), overdue highlighting on Home.
- ✅ **Carry-forward** open questions into new work captures.
- ✅ **Search** (`/api/search` ILIKE across sessions/tasks/contacts).
- ✅ **Ask-your-stuff chat** (keyword filter → SQL → `streamText` SSE → streaming UI in Ask.tsx).
- ✅ **Export/backup** (Markdown + JSON, `Content-Disposition: attachment`, both spaces).
- ✅ Settings page (digest time/enabled, push subscribe/unsubscribe, AI model info, export buttons).
- ⏭️ **Projects** + **recurring routines** (Personal) — deferred to Phase 3.
- ⏭️ Android share sheet — deferred to Phase 3.

## PHASE 3 — Power features (optional)  [status: ⏭️ not started]
- ⬜ Weekly review + completion stats. Configurable evening digest. More spaces.
- ⬜ Integrations (Todoist/Jira/calendar). Offline in-browser transcription. (Diarization stays out.)

---

## Work Log (append-only, newest last)
- 2026-06-17 — Plan finalized (workspaces + full feature set).
- 2026-06-17 — Research complete: 6 parallel research streams verified against official docs; wrote meeting-assistant-research.md (final stack locked). Key change: single Worker (not Pages+Worker); Neon serverless HTTP + Drizzle; Vercel AI SDK; web-push works in Workers via nodejs_compat.
- 2026-06-17 — Created this BUILD-PROGRESS.md. Next: Phase 1 Task 1.1.
- 2026-06-17 — Phase 1.A complete. Vite 6 + React 19 SPA built clean (297 KB JS / 13 KB CSS). 35 files committed to git. Stack: Tailwind v4, shadcn CSS vars, vite-plugin-pwa, React Router v7, Zustand persist, TanStack Query v5, Hono dep added, wrangler.jsonc configured. `npm run build` → `dist/` with SW + manifest verified. Next: Phase 1.B (Drizzle schema + Neon migration).
- 2026-06-17 — Phase 1.B + 1.C + 1.D complete. New deps: drizzle-orm, @neondatabase/serverless, drizzle-kit, ai (v6), @ai-sdk/google, zod, jose, @hono/zod-validator. 7-table Drizzle schema + DB client + drizzle.config.ts. Hono API (4 route files) + Access JWT middleware + extraction service (Gemini 2.5 Flash-Lite / Flash, Zod schemas). Frontend: TanStack Query hooks, useSpeech hook (restart loop + wake lock), NewCapture page, all 5 read screens fully wired. Build clean: 344 KB JS. Migration pending Neon credentials.
- 2026-06-17 — Phase 2 complete. New deps: web-push. Backend: push routes (subscribe/unsubscribe/vapid-public-key), push-send service (cleans stale endpoints on 404/410), digest service (local-8am + due-reminders 5-min window), settings route, search route (ILIKE), ask route (streamSSE + Gemini 2.5 Flash), export route (Markdown + JSON). SW updated with push + notificationclick handlers (injectManifest strategy). Frontend: usePush hook, Settings page, Ask page (SSE streaming chat with suggestions + error handling). Build clean: 354 KB JS.

## Blockers
- None currently.
