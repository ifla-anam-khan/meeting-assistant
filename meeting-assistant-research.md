# Meeting & Life Assistant — Technical Research & Decisions

> Decision-ready research for building the app in [meeting-assistant-plan.md](meeting-assistant-plan.md).
> All facts verified against official docs mid-2026. Every section ends with sources.
> **Read this before coding. The "Final Stack" table (§9) is the build contract.**

---

## 0. Headline decisions (what changed vs the plan)

| Topic | Plan said | Research says | Why |
|---|---|---|---|
| Hosting + backend | Cloudflare **Pages** + a **separate** Worker | **One Worker** with Static Assets serving the SPA **+** API (Hono) **+** Cron | Cloudflare's official 2026 guidance is "start with Workers." Pages Functions **cannot run Cron** (we need it for the digest). One Worker on one hostname kills CORS + Access-redirect pain. |
| DB access | Neon (generic) | Neon + **`@neondatabase/serverless` (HTTP)** + **Drizzle ORM** | Plain `pg` can't open TCP sockets in the Workers runtime. Drizzle is the lightest edge-native type-safe ORM. |
| LLM call | "structured JSON, swappable" | **Vercel AI SDK** (`generateObject` + `create*` factories) | One interface for Gemini/Claude/GPT incl. structured output; works in Workers if you pass keys from `env`. |
| Extraction model | "Gemini" | **Gemini 2.5 Flash-Lite** (extraction) + **2.5 Flash** (chat) | Flash-Lite = 1,000 req/day free (4× Flash) and cheapest; Flash = better synthesis for chat. |
| Push from Worker | "web-push" | **`web-push` + `nodejs_compat`** (now works) or **PushForge** (zero-dep) | `node:crypto` shipped fully in Workers Apr 2025; the old blocker is gone. |
| Chat retrieval | "ask-anything" | **SQL/keyword filter → stuff rows into prompt. No vector DB.** | Hundreds of records fit in context; embeddings are overkill at this scale. |

**Net effect:** simpler architecture (one deployable), all still 100% free.

---

## 1. React PWA Tooling

**Cross-cutting finding:** for an SPA on Cloudflare, full-stack framework "SPA modes" are the friction path. Cloudflare's own React Router guide says *"SPA mode … not currently supported with the Cloudflare Vite plugin"* and recommends *"the React template + React Router as a library."* So a plain Vite SPA is both simplest and best-supported.

| Decision | Options | **Chosen** | Rationale |
|---|---|---|---|
| Build tool | Vite SPA / Next.js / RR framework mode | **Vite (React-TS SPA)** | Static `dist/` deploys with zero adapters; best PWA tooling; SSR buys nothing for a private app. |
| PWA layer | vite-plugin-pwa | **vite-plugin-pwa, `registerType: 'autoUpdate'`** | Auto-generates manifest + SW, precaches app shell for offline read, minimal config. |
| Routing | React Router (declarative) / RR data mode / TanStack Router | **React Router, declarative `<BrowserRouter>`** | Lightest for ~6 routes; exactly what CF recommends. TanStack Router has documented CF-Pages SPA shell bugs. |
| State | Context / Zustand / TanStack Query | **One Zustand store (`persist`)** for workspace + local UI; **TanStack Query** for server data once the API exists | Zustand `persist` pairs with offline; don't duplicate server data into a client store. |
| UI | Tailwind+shadcn / Tailwind only / plain CSS | **Tailwind v4 (`@tailwindcss/vite`) + shadcn/ui à la carte** | CSS-first (no config file), fast; shadcn copies component source in (no runtime UI dep). |

**Integration notes**
- Scaffold: `npm create vite@latest meeting-assistant -- --template react-ts`; build → `dist`.
- **SPA routing on Workers static assets:** `wrangler.jsonc` → `"assets": { "directory": "./dist/", "not_found_handling": "single-page-application" }` (serves `index.html` 200 for unmatched routes).
- **vite-plugin-pwa:** `npm i -D vite-plugin-pwa`; `VitePWA({ registerType: 'autoUpdate', manifest: {...} })`.
- **Android install requirements (verified):** HTTPS (✓ on `*.workers.dev`), valid manifest, registered SW, **both 192×192 and 512×512 icons**, plus a **maskable** icon (`purpose: 'any maskable'`) or the icon gets letterboxed. Custom install button → listen for `beforeinstallprompt`, call `prompt()` on a user gesture.
- **Tailwind v4:** `npm i tailwindcss @tailwindcss/vite`; add `tailwindcss()` plugin; single `@import "tailwindcss";` in CSS — no `tailwind.config.js`. shadcn: `npx shadcn@latest init`.
- **Make the Work/Personal switcher app state, not a route** — both spaces share the same screens.

**Sources:** [CF React Router](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/) · [CF SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) · [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/) · [Vite PWA minimal reqs](https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements) · [React Router modes](https://reactrouter.com/start/modes) · [Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4) · [shadcn Vite](https://www.shadcn.io/ui/installation/vite)

---

## 2. Cloudflare Platform (Workers, Static Assets, Cron, Access)

**Architecture: one Worker on one hostname**, behind one Access app: serves the SPA (static assets), the API (Hono router), and the Cron handler.

### 2.1 Hosting / free tier
- **Pages static bandwidth/requests: unlimited & free** (no GB cap — ignore blogs citing one). 500 builds/mo. *(We're using Workers, but same economics.)*
- **Workers free tier:** **100,000 requests/day**, **10 ms CPU/request** (LLM/DB **wait time does NOT count** — only compute), **50 subrequests/request**, **6 simultaneous open connections**. Cron invocations count toward the 100k/day.
- **Commercial use allowed** on free; only restriction is serving disproportionate video/large media.
- Deploy: `npx wrangler deploy`. SPA fallback via `not_found_handling: "single-page-application"`.

### 2.2 Worker vs Pages Functions → **Worker** (Cron forces it)
- Pages Functions **can't run Cron**; Workers can. Workers are also Cloudflare's 2026 focus.
- **Routing:** use **Hono** in the Worker's `fetch` handler. With static assets, assets serve first unless `run_worker_first`.

### 2.3 Cron Triggers
```jsonc
// wrangler.jsonc
{ "triggers": { "crons": ["0 * * * *"] } }   // hourly; compute local 8am inside handler
```
```js
export default {
  async fetch(req, env, ctx) { /* Hono app */ },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env)); // branch on controller.cron if multiple
  }
};
```
- **Free limit: 5 cron triggers/account**, min interval 1 min, 10 ms CPU, 15-min wall cap.
- **Cron runs in UTC only.** For a DST-safe "8am local" digest: **trigger hourly** and inside `scheduled()` compute local time with `Intl.DateTimeFormat` (IANA zone), send only when it's the user's configured hour. (Simpler than hardcoding a UTC offset.)
- Test: `wrangler dev --test-scheduled` → `curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"`.

### 2.4 Secrets / env
- **Secrets (encrypted):** LLM API key(s), `VAPID_PRIVATE_KEY`, `DATABASE_URL`. Set via `npx wrangler secret put NAME`.
- **Vars (plaintext, `[vars]`):** `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `LLM_PROVIDER`.
- **Local dev:** `.dev.vars` (gitignore it). Access as `env.NAME`.

### 2.5 Cloudflare Access — gate to one email (free)
- **Free Zero Trust = 50 seats.** Self-hosted Access app, policy: Action **Allow**, Include → **Emails** → `sharuk205343@gmail.com`. Deny-by-default.
- **Google IdP:** OAuth web client; origin `https://<team>.cloudflareaccess.com`, redirect `…/cdn-cgi/access/callback`.
- **Identity to backend:** validate header **`Cf-Access-Jwt-Assertion`** with **`jose`** (`createRemoteJWKSet` against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), check issuer + **AUD** tag; email in `email` claim. (Single-user: Access already guarantees it's you; JWT validation is defense-in-depth.)
- **⚠️ PWA caveats (important):**
  - On session expiry, `fetch()` to a protected path returns **login HTML / 302**, not JSON/401. Use `fetch(url, { redirect: 'manual' })`, detect `response.redirected` / `text/html`, and trigger a **full-page reload** to re-auth.
  - **Service worker: never cache** protected API endpoints or `/cdn-cgi/access/*` — cache only the public app shell.
  - **Same hostname for PWA + API** (one Worker) avoids cross-origin preflight getting caught by the login redirect.

**Sources:** [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Static assets SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) · [Workers-first blog](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/) · [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) · [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [Access Google IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/) · [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) · [Zero Trust seats](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/)

---

## 3. Database — Neon Postgres

### Free tier (verified)
0.5 GB storage/project · 100 CU-hours/mo · 5 GB transfer/mo · **scale-to-zero (5-min idle, can't disable), auto-wakes in a few hundred ms, NO manual unpause** (vs Supabase's 7-day pause + manual restore). Comfortably free for single-user.

### Connect from a Worker → **`@neondatabase/serverless` (HTTP)**
Plain `pg` opens a **raw TCP socket** — not available in the Workers runtime. The Neon serverless driver speaks **HTTP fetch** (or WebSocket) which Workers support. HTTP is best for one-shot queries (our case). WebSocket only if interactive transactions are needed (a WS conn can't outlive one `fetch`).

### ORM → **Drizzle (`drizzle-orm/neon-http`)**
| Option | Edge fit | Simplicity | Verdict |
|---|---|---|---|
| **Drizzle** | Excellent (native neon-http) | High, no codegen, tiny bundle | **Chosen** |
| Prisma | Works via `@prisma/adapter-neon` | Medium (codegen + adapter) | More moving parts, no benefit at this scale |
| Raw SQL | Excellent | Simplest start, unsafe to scale | No types/migrations |

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
const db = drizzle({ client: neon(env.DATABASE_URL) });
```

### Migrations → **drizzle-kit**, run locally (not in Worker)
`drizzle-kit generate` (diff schema → SQL) then `drizzle-kit migrate`. Use the **direct/unpooled** URL for migrations; use the **pooled (`-pooler`)** URL for runtime queries. Keep two env vars: `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED` (migrations).

> **Note — Hyperdrive alternative:** Cloudflare's Hyperdrive (free) + `pg` is another valid path (pooling + query cache, no egress). For a single-user app the Neon serverless HTTP driver is simpler (no extra resource to provision), so we use it. Revisit Hyperdrive only if connection volume grows.

**Sources:** [Neon free limits](https://neon.com/faqs/free-plan-limits-and-quotas) · [Neon scale-to-zero](https://neon.com/docs/introduction/scale-to-zero) · [Neon + CF Workers](https://neon.com/docs/guides/cloudflare-workers) · [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver) · [Neon connection choice](https://neon.com/docs/connect/choose-connection) · [Drizzle + Neon](https://orm.drizzle.team/docs/connect-neon) · [drizzle-kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)

---

## 4. LLM — Gemini Free Tier + Provider Abstraction

### Models (verified; numbers live at aistudio.google.com/rate-limit)
| Model | Free RPM | Free RPD | Use |
|---|---|---|---|
| **2.5 Flash-Lite** | 15 | **1,000** | **Extraction** (cheapest, highest RPD, schema-following is enough) |
| **2.5 Flash** | 10 | 250 | **Chat** (better synthesis) |

⚠️ **Dec 2025 cuts were real** (free tier reduced 50–80%; 2.5 Pro → ~0 free). 2.0 models retired ~Jun 2026. **Design assuming you may need to flip to paid Tier 1 or another provider** — which the abstraction below makes trivial. Both models share 250K TPM + 1M context (fits long transcripts).

### Structured output → `responseMimeType: "application/json"` + `responseSchema`
Constrained decoding forces **syntactically valid** JSON matching the schema (UPPERCASE types: `OBJECT/ARRAY/STRING`; use `propertyOrdering`). **Not** semantic correctness — **always validate with Zod after parsing**, and set generous `maxOutputTokens` to avoid truncated JSON. (Function calling is for *taking actions*, not shaping output — don't use it for extraction.)

### Abstraction → **Vercel AI SDK** (`ai` + `@ai-sdk/google` / `@ai-sdk/anthropic` / `@ai-sdk/openai`)
- `generateObject({ model, schema, prompt })` for extraction (maps to each provider's native structured output); `streamText`/`generateText` for chat. One call site, swap `model`.
- **⚠️ In Workers: MUST use `createGoogleGenerativeAI({ apiKey })` etc. factory functions** with keys from `env` — the bare `google()`/`anthropic()` imports read `process.env` and **fail silently in Workers**.
```ts
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
const model = env.LLM_PROVIDER === 'claude'
  ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })('claude-haiku-4-5')
  : createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })('gemini-2.5-flash-lite');
const { object } = await generateObject({ model, schema: ExtractionSchema, prompt });
```
> Fallback if minimizing bundle: hand-roll a `fetch`-based `extract()`/`chat()` over the REST `:generateContent` endpoint. The SDK's `generateObject` parity across providers is why we prefer it.

### Cost if switching later (≈15K in + 1K out per meeting)
Flash-Lite ~$0.002 · Flash ~$0.007 · **Claude Haiku 4.5 ~$0.02** · Opus 4.8 ~$0.10 · GPT-mini-tier ~$0.003. **Extraction is sub-cent to ~2¢** — choose provider on quality/availability, not cost.

**Sources:** [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) · [generateContent API](https://ai.google.dev/api/generate-content) · [Vercel AI SDK on Workers](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

---

## 5. Live Transcription — Web Speech API

### Support (verified)
- **Android Chrome PWA (our target): fully works** in installed standalone mode over HTTPS with mic permission. ✓
- **iOS/Safari PWA: API present but non-functional** (`start()` silently no-ops, no mic prompt). Not our target; would need cloud-STT fallback.
- **Cloud-dependent:** Chrome streams audio to Google; **needs internet**, no offline. Disclose to participants.
- Chrome 139 (Aug 2025) added `processLocally` (on-device), `available()`/`install()` language packs, and `phrases` (contextual biasing for names/jargon) — but **on-device is desktop-focused; assume Android still uses cloud.** Treat `processLocally` + `phrases` as progressive enhancement.

### Approach → **custom React hook** (not `react-speech-recognition`)
Long-meeting capture needs tight control over the restart loop + cross-restart dedup, which the generic library abstracts away (and it warns Android continuous mode is a "noisy experience"). ~80 lines, no dep risk.

### The restart loop (the core of it)
- `continuous = true`, `interimResults = true`, `lang = "en-US"`.
- Keep a durable `committed` string; on each `result`, iterate from `event.resultIndex`: append `isFinal` segments to `committed`, collect non-final into `interim`; render `committed + interim`. **Never append interim to committed** (=#1 duplication bug). `event.results` resets on restart, but finals are already in `committed` → no cross-restart dupes.
- `onend`: if user still intends to listen, `setTimeout(() => recognition.start(), 250–500ms)` (debounce avoids busy-loop). This **is** the silence-auto-stop workaround.
- `onerror`: `no-speech`/`aborted` → benign (let onend restart); `network` → restart with exponential backoff (reset on success); `not-allowed`/`service-not-allowed` → **stop, show error, do NOT loop**.
- Guard `start()` in try/catch (`InvalidStateError` if already started).
- **Screen Wake Lock** (`navigator.wakeLock.request("screen")`, re-acquire on `visibilitychange`) to stop the screen sleeping mid-meeting. Capture dies if app is backgrounded — warn user to keep it foregrounded.
- Flush `committed` to IndexedDB periodically for long sessions.

### Known gotchas
Android emits an audible **beep on each mic restart** (no JS suppression — set UX expectations). No diarization. Accuracy degrades with crosstalk/accents — use `phrases` biasing. Keep the **paste fallback** for any meeting where live capture struggles.

**Sources:** [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) · [MDN Using Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) · [Chrome 139 new](https://developer.chrome.com/blog/new-in-chrome-139) · [react-speech-recognition](https://github.com/JamesBrill/react-speech-recognition) · [whatpwacando speech](https://whatpwacando.today/speech-recognition/) · [caniuse](https://caniuse.com/speech-recognition)

---

## 6. Web Push Notifications + Ask-Your-Data Chat

### Push flow (Android Chrome PWA: fully supported)
1. Register SW → `Notification.requestPermission()` **from a user gesture**.
2. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID public> })` → store the `PushSubscription` (endpoint + `p256dh`/`auth`) in Neon.
3. Server POSTs encrypted Web Push to `subscription.endpoint`; OS wakes browser → SW `push` event (even when app closed) → **must** call `showNotification()`.
- No FCM account needed (only VAPID). iOS: works only as installed PWA on 16.4+, weaker parity (action buttons may be ignored) — always handle plain body-click.

### VAPID
One ECDSA P-256 keypair: public → `subscribe()`; private → signs a per-send JWT (`aud`/`exp`≤24h/`sub: mailto:`). Generate: `npx web-push generate-vapid-keys`. Store private as secret, public+subject as vars.

### Sending push from a Worker — **resolved: it works**
`node:crypto` (incl. P-256 `createECDH`) **shipped fully in Workers Apr 2025**. The old "createECDH is not a function" blocker is gone.
- **Preferred: `web-push` npm + `"compatibility_flags": ["nodejs_compat"]`** (recent compat date). This is now Cloudflare's officially documented path (Agents → Push notifications guide).
- **Zero-dep fallback:** **PushForge** (`@pushforge/builder`) or `@block65/webcrypto-web-push` — pure Web Crypto + `fetch`, no compat flag.
- **Always delete subscriptions on 404/410 Gone.**

### Digest scheduling + action buttons
- Cron `scheduled()` handler queries due/overdue tasks, builds digest, loops subscriptions sending push (`ctx.waitUntil`). Runs **UTC** → compute local 8am inside (see §2.3).
- `showNotification(title, { body, actions: [{action:'done', title:'Mark done'}], data: { taskId, url } })`.
- `notificationclick` in SW: `event.action` = button id (empty = body click); `event.waitUntil(fetch(...))` to mark done or `clients.openWindow(url)`. iOS may ignore `actions` → body-click must do something sensible.

### Ask-your-data chat → **no vector DB**
For one user's hundreds of records: **SQL/keyword + date filter → stuff matching rows into the prompt** (or stuff everything if it fits the 1M context). Deterministic, debuggable, exact date filtering, zero extra infra. Let the LLM emit a structured filter / `WHERE` via the schema, or keyword-match.
**Graduate to embeddings (Cloudflare Vectorize) only when:** corpus exceeds what fits context, queries are semantic/paraphrased over long free-text notes, or keyword overlap starts failing.

**Sources:** [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) · [web.dev push overview](https://web.dev/articles/push-notifications-overview) · [CF Agents push guide](https://developers.cloudflare.com/agents/guides/push-notifications/) · [CF node crypto changelog](https://developers.cloudflare.com/changelog/2025-04-08-nodejs-crypto-and-tls/) · [PushForge](https://github.com/draphy/pushforge) · [notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event) · [RAG without embeddings](https://www.digitalocean.com/community/tutorials/beyond-vector-databases-rag-without-embeddings)

---

## 7. Gaps & risks to watch during build

1. **Gemini free-tier volatility.** Numbers were cut hard in Dec 2025 and live in the per-account dashboard. Mitigation: provider abstraction (§4) + validate the live limit before relying on it.
2. **Access + PWA session expiry** returns HTML to `fetch` (§2.5). Must handle with `redirect:'manual'` + full reload, and keep the SW off protected paths. This is the single trickiest integration.
3. **Android Web Speech beep + foreground requirement** (§5) — a UX limitation, not fixable in code. Set expectations; keep paste fallback.
4. **Cron is UTC** — compute local time in-handler for the 8am digest (§2.3).
5. **Vercel AI SDK factory-function rule** in Workers (§4) — bare imports fail silently.
6. **Drizzle migrations use the unpooled URL**; runtime uses pooled (§3).
7. **Worker 10ms CPU free limit** — fine because LLM/DB wait is exempt; watch if we add heavy in-Worker compute.

---

## 8. Recommended repo shape (single Worker)

```
meeting-assistant/
  wrangler.jsonc              # assets + triggers(crons) + bindings
  drizzle.config.ts
  .dev.vars                   # gitignored
  src/
    worker/                   # backend (runs in Worker)
      index.ts                # fetch (Hono app) + scheduled (cron)
      routes/                 # captures, tasks, remember, contacts, chat, push
      services/               # extraction (AI SDK), digest, push-send
      db/ schema.ts, client.ts
      auth/ access.ts         # Cf-Access JWT validate (jose)
    web/                      # React PWA (built to dist/)
      main.tsx, App.tsx
      pages/ Home, NewCapture, Todo, Remember, CapturesList, CaptureDetail
      components/, store/ (zustand), hooks/ useSpeech.ts, lib/ api.ts
      sw/ (push + notificationclick)  # or vite-plugin-pwa injectManifest
  migrations/
```

---

## 9. FINAL STACK (build contract)

| Layer | Choice | Free? | Key integration rule |
|---|---|---|---|
| Build | **Vite (React-TS SPA)** | ✓ | output `dist/` |
| PWA | **vite-plugin-pwa** (`autoUpdate`) | ✓ | 192+512+maskable icons; SW must not cache protected API/`/cdn-cgi/access/*` |
| Routing | **React Router** (declarative) | ✓ | workspace = state, not route |
| State | **Zustand** (`persist`) + **TanStack Query** for API | ✓ | don't mirror server data in Zustand |
| UI | **Tailwind v4 + shadcn/ui** | ✓ | no config file; shadcn à la carte |
| Hosting+API+Cron | **One Cloudflare Worker** (static assets + Hono + scheduled) | ✓ | `not_found_handling: single-page-application`; same hostname as API |
| DB | **Neon Postgres** | ✓ | scale-to-zero, no manual unpause |
| DB driver | **`@neondatabase/serverless` (HTTP)** | ✓ | plain `pg` won't work in Workers |
| ORM | **Drizzle** (`neon-http`) | ✓ | migrations via drizzle-kit, **unpooled** URL; runtime **pooled** URL |
| LLM | **Gemini 2.5 Flash-Lite** (extract) / **2.5 Flash** (chat) | ✓ | structured output + Zod validate; flip to paid/other if quota cut |
| LLM abstraction | **Vercel AI SDK** (`generateObject`/`streamText`) | ✓ | **`create*({apiKey})` factories from `env`** in Workers |
| Transcription | **Web Speech API** (custom hook) | ✓ | restart loop + dedup; wake lock; paste fallback |
| Push | **`web-push` + `nodejs_compat`** (or PushForge) | ✓ | delete subs on 404/410 |
| Notifications schedule | **Cron Trigger** (hourly → local-8am check) | ✓ | UTC; compute local in handler |
| Auth | **Cloudflare Access** → single email | ✓ | validate `Cf-Access-Jwt-Assertion` (jose) |
| Chat retrieval | **SQL/keyword filter → prompt** (no vector DB) | ✓ | embeddings only if scale/semantics demand |

**Everything above is free at single-user scale.** Only optional spend: switching extraction to Claude/GPT (sub-cent to ~2¢/meeting).
