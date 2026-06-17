# BUILD PROGRESS — Meeting & Life Assistant

> **Living state file. Every skill/agent MUST read this first and update it after each unit of work.**
> Companion docs: [meeting-assistant-plan.md](meeting-assistant-plan.md) (what to build) · [meeting-assistant-research.md](meeting-assistant-research.md) (how/with what — the build contract).
> Last updated: 2026-06-17 · Current phase: **Phase 1.A — complete ✅ | Phase 1.B — next**

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

## Next Action
> **Start Phase 1.B, Task 1.6** (Drizzle schema). Requires: Neon account + `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED`. If Neon isn't set up yet, schema file can be written locally first and migration applied once credentials exist.

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
- ⬜ **1.6** Drizzle schema for: Session, Task, RememberItem, Contact, Project, PushSubscription, Settings (see plan §6). Include `space`, timestamps, nullable FKs.
- ⬜ **1.7** drizzle.config.ts; generate + apply first migration to Neon (unpooled URL). DB client (neon-http, pooled URL).

### 1.C Backend (Worker)
- ⬜ **1.8** Hono app in Worker `fetch`; health route; error handling (never leak raw errors).
- ⬜ **1.9** Access auth middleware — validate `Cf-Access-Jwt-Assertion` (jose); allow in local dev.
- ⬜ **1.10** Extraction service: Vercel AI SDK `generateObject` + Zod schema (4 categories + TL;DR + priority + auto due dates). Provider factory from `env`.
- ⬜ **1.11** API routes (scoped by `space`): `POST /captures` (transcript→extract→save), `GET /captures`, `GET /captures/:id`, `GET /tasks`, `PATCH /tasks/:id` (tick/edit/delete), `POST /tasks` (quick add), `GET /remember`, `GET /contacts`.

### 1.D Frontend screens (per space)
- ⬜ **1.12** API client (`lib/api.ts`) + TanStack Query hooks; handle Access session-expiry (redirect:'manual' → full reload).
- ⬜ **1.13** **New Capture**: Work = live record (Web Speech custom hook + wake lock) + paste; Personal = voice brain-dump. Editable transcript → run extraction → save.
- ⬜ **1.14** `useSpeech` hook: restart loop, interim/final dedup, error handling, wake lock (research §5).
- ⬜ **1.15** **Home/Today**, **To-Do** (tick/edit/delete, priority+due sort), **Remember** (Work), **Captures list** (with TL;DR), **Capture detail** (transcript + items + source-quote highlight).
- ⬜ **1.16** Quick manual add (+).

### 1.E Integration & deploy
- ⬜ **1.17** End-to-end local test: record/paste → extract → save → appears on all screens, both spaces isolated.
- ⬜ **1.18** First deploy (`wrangler deploy`); then user configures Access; set secrets; verify gated + working on the Samsung phone (install to home screen, mic permission, capture).

**Phase 1 done when:** installed PWA, switch Work/Personal, capture by voice or paste, extraction populates the 4 categories + TL;DR + priority + due dates, all read screens work, data persists in Neon, app gated to the single email.

---

## PHASE 2 — Genuinely useful  [status: ⏭️ not started]
- ⬜ Web Push setup (SW push + notificationclick, subscribe flow, store subscription).
- ⬜ Cron Worker: hourly local-8am **combined digest** (Work/Personal sections) + due-reminder sends; **snooze**; **"Did you do it?"** action button.
- ⬜ Per-item reminders (`reminder_at`), overdue highlighting.
- ⬜ **Projects** + **recurring routines** (Personal).
- ⬜ **Carry-forward** open questions into new captures.
- ⬜ **Search** + **Ask-your-stuff chat** (SQL filter → prompt).
- ⬜ **Export/backup** (Markdown/JSON) + **share** a meeting summary (Android share sheet).
- ⬜ Auto-suggest meeting name. Provider switch in UI.

## PHASE 3 — Power features (optional)  [status: ⏭️ not started]
- ⬜ Weekly review + completion stats. Configurable evening digest. More spaces.
- ⬜ Integrations (Todoist/Jira/calendar). Offline in-browser transcription. (Diarization stays out.)

---

## Work Log (append-only, newest last)
- 2026-06-17 — Plan finalized (workspaces + full feature set).
- 2026-06-17 — Research complete: 6 parallel research streams verified against official docs; wrote meeting-assistant-research.md (final stack locked). Key change: single Worker (not Pages+Worker); Neon serverless HTTP + Drizzle; Vercel AI SDK; web-push works in Workers via nodejs_compat.
- 2026-06-17 — Created this BUILD-PROGRESS.md. Next: Phase 1 Task 1.1.
- 2026-06-17 — Phase 1.A complete. Vite 6 + React 19 SPA built clean (297 KB JS / 13 KB CSS). 35 files committed to git. Stack: Tailwind v4, shadcn CSS vars, vite-plugin-pwa, React Router v7, Zustand persist, TanStack Query v5, Hono dep added, wrangler.jsonc configured. `npm run build` → `dist/` with SW + manifest verified. Next: Phase 1.B (Drizzle schema + Neon migration).

## Blockers
- None currently.
