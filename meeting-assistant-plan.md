# Meeting & Life Assistant — Project Plan & Requirements

## 1. Goal

A personal assistant that makes sure **nothing gets forgotten** — at work *or* in your own life.

- **Work:** you record (or paste) a meeting and it gives you a clear list of what *you* must do, what was decided, and who to contact for what.
- **Personal:** you talk out your tasks, routines, and projects (the apps/SaaS you're building), and it keeps them organized too.

Both live in one app, in **separate workspaces** you switch between, so work and personal never mix. Everything is stored, searchable, askable in plain language, and it reminds you before things slip.

The core promise: *"I never have to wonder what I'm supposed to remember or do — at work or in my own life."*

**Hard constraint:** the whole thing must be **free to deploy and run**. The only credential you bring is an LLM API key you already have (Gemini / Claude / GPT) — and even that is free using Gemini's free tier. No paid hosting, database, or transcription service.

---

## 2. Workspaces (the core idea)

A **switcher in the top-right corner** toggles between two spaces:

- **Work** — meeting-centric. You capture meetings; it extracts action items, decisions, contacts, and open questions.
- **Personal** — *you*-centric. You brain-dump tasks by voice; it organizes them into to-dos, projects, and recurring routines.

Every feature (to-do list, reminders, daily digest, search, ask-anything chat, export, weekly review) works **inside each space, scoped** so the two never bleed together. The architecture allows adding more spaces later (e.g. a specific business). All data carries a `space` tag.

---

## 3. How It Works (end-to-end)

**Work space**
1. Open the app (installed to your Samsung home screen), make sure you're in **Work**.
2. **Record the meeting live in the app** (real-time transcription) or **paste** a transcript.
3. The app **auto-suggests a name** (you can edit) and stamps date/time.
4. The LLM extracts structured items + a TL;DR summary + per-item priority, and **auto-fills due dates** from phrases like "by Friday."
5. It's saved, rolled into your dashboards, and feeds reminders + the daily digest.

**Personal space**
1. Switch to **Personal** (top-right).
2. **Tap record and talk** — *"finish the landing page, call the bank, gym at 6, journal tonight."*
3. The LLM turns it into tasks, attaches them to **projects** where relevant, and sets up **recurring routines**.
4. Same dashboards, reminders, digest, search, and ask-chat — scoped to Personal.

Live transcription runs **inside the browser for free** (see Section 8).

---

## 4. Functional Requirements

### 4.1 Workspaces & switching
- Top-right switcher between **Work** and **Personal**; all views, data, reminders, search, and chat are scoped to the active space.
- Extensible to more spaces later.

### 4.2 Capture
- **Work:** live in-app recording with real-time transcription (primary), plus a **paste** fallback. **Auto-suggested meeting name** from the transcript (editable). Auto date/time.
- **Personal:** voice **brain-dump** — tap record, talk, get a task list. No "meeting" framing.
- Edit the transcript (recorded or pasted) before extraction, to fix names/numbers.

### 4.3 AI Extraction
- Send the transcript to an LLM using **structured output / tool-use** so it always returns valid, typed JSON (not free-text "please return JSON").
- Default to **Gemini free tier** (zero cost); keep the call **provider-swappable** to your Claude/GPT key for higher quality anytime.
- Work extracts the four categories (Section 5) + a **2–3 sentence TL;DR** + per-item **priority**, and **auto-fills due dates**. Personal extracts tasks (+ project/routine hints).
- Each item stores its exact **source quote**, highlighted in the transcript by text-matching.
- The LLM infers obvious attribution ("I'll send the report" = you) without speaker labels.

### 4.4 Tasks, Projects & Routines
- **To-do list** per space: **tick / delete / edit** any item (text, due date, priority, reminder).
- **Priority** (high / normal) so urgent items float to the top and lead the digest.
- **Quick manual add** ("+") for tasks that didn't come from a capture.
- **Projects** (Personal): group tasks under projects — "SaaS product," "Side app," "Daily routine" — each with its own mini to-do list, notes, and progress.
- **Recurring routines** (Personal): daily/weekly repeating tasks (gym, journaling) that auto-regenerate and feed the digest.
- **Carry-forward**: when you start a new meeting/capture, unresolved **open questions** from before are surfaced so they actually get closed.

### 4.5 Reminders & Notifications
- **Per-item reminders** with a due time; **snooze** ("remind me tomorrow") from the notification or the item.
- **Auto-set reminders** from extracted due dates (you confirm).
- **Daily digest at ~8am** — a **single push, split into Work and Personal sections**: total pending, which are overdue, from which meeting/project. Example: *"Work: 3 pending (1 overdue from 'Cloud Sync'). Personal: 2 due — gym, ship landing page."* Digest time configurable; either section muteable.
- **"Did you do it?" check** — when a due date passes, the notification asks *"Done?"*; one tap closes it.
- Built on **Web Push** in the installed PWA, scheduled/sent by a free **Cloudflare Cron Worker** so it fires even when the app is closed.

### 4.6 Recall — search & ask-anything
- Full-text **search** across every capture, item, and contact (scoped to the active space).
- **Ask-your-stuff chat**: ask in plain language — *"What did we decide about the cloud budget?"* / *"What's left on the SaaS launch?"* — and the LLM answers from your past captures with the **source quote + which meeting/project**. Cheap/free since the data is small.

### 4.7 Export & backup
- **One-tap export** of all captures + items as **Markdown or JSON**. No lock-in, and a safety net on free tiers.
- **Share** a single meeting's summary + action items via the Android share sheet (WhatsApp/email).

### 4.8 Storage & Organization
- Save each capture as its own record (name, date/time, transcript, TL;DR, items).
- Aggregate items across captures into per-space dashboards.
- The to-do and remember pages are just queries across captures within a space.

### 4.9 Screens / Pages (per space)
- **Home / Today** — what's due today + overdue, plus the day's digest. The landing screen.
- **New Capture** — Work: record/paste a meeting; Personal: voice brain-dump.
- **To-Do / Action Items** — everything to do; filter pending/done, sort by priority + due date.
- **Projects** (Personal) — project list, each opening to its tasks/notes/progress.
- **Remember** (Work) — decisions, key facts, people directory.
- **Captures list** — all past meetings/brain-dumps by date, each showing its TL;DR.
- **Capture detail** — the transcript + items extracted, with quote highlighting.
- **Ask** — the chat box over your data.
- **Settings** — digest time, provider choice, export.

The app is a **PWA** — "Add to Home Screen" gives an app icon and fullscreen experience; no native app needed.

---

## 5. What Gets Extracted (Work)

| Category | What it captures | Example |
|---|---|---|
| My action items | Tasks *you* must do | "Send the report by Friday" |
| Decisions & key info | What was decided / important facts | "We're moving the launch to Q3" |
| People & contacts | Who to contact for what | "For cloud queries, contact Ramesh" |
| Open questions / follow-ups | Things left unresolved (feed carry-forward) | "Need to confirm budget with finance" |

Plus, per meeting: a **TL;DR summary**; per action item: **due date**, **who asked** (inferred), **priority**. Personal capture extracts **tasks** with project/routine hints.

---

## 6. Data Model

**Session** (a capture — one row per meeting or brain-dump)
- id, space (work/personal), type (meeting / braindump), name, created_at, raw_transcript, summary (TL;DR), status

**Task** (unified to-do across both spaces)
- id, space, session_id (nullable — null for quick-add/manual), project_id (nullable), text, assigned_by, due_date, reminder_at, snoozed_until, priority (high/normal), recurrence (none/daily/weekly/…), status (pending/done), source_quote, created_at, updated_at

**RememberItem** (Work)
- id, session_id, space, type (decision/fact/follow-up/open-question), text, source_quote, created_at, updated_at

**Contact** (Work)
- id, session_id, space, name, topic, notes, source_quote, created_at, updated_at

**Project** (Personal)
- id, space, name, notes, status, created_at, updated_at

**PushSubscription** (so the Cron Worker can notify)
- id, endpoint, keys, created_at

**Settings**
- id, digest_time (default 08:00), digest_enabled, digest_combined (default true)

Single-user, so no user table; access is locked at the edge (Section 7).

---

## 7. Recommended Tech Stack — 100% Free

| Piece | Choice | Why / Cost |
|---|---|---|
| **Frontend (PWA)** | React (manifest + service worker) | Installs to home screen, fullscreen |
| **Hosting** | **Cloudflare Pages** | Most generous free tier — unlimited bandwidth, no commercial-use restriction |
| **Backend / LLM proxy** | **Cloudflare Worker** | Hides the LLM key from the browser; calls the LLM, returns JSON. Free. |
| **Notifications** | **Web Push** + **Cloudflare Cron Worker** | Free scheduled job checks due/overdue items + sends the 8am digest. Works on Android-Chrome PWAs. |
| **Live transcription** | **Web Speech API** (browser built-in) | Real-time, in-app, free (Section 8) |
| **Extraction & chat LLM** | **Gemini free tier** (≈250–1,000 req/day); swappable to Claude/GPT | Far above single-user use |
| **Database** | **Neon** (serverless Postgres) | Free, auto-sleeps, **wakes in ~1s** (vs Supabase, which pauses after a week and needs manual restart) |
| **Auth** | **Cloudflare Access**, locked to your email | Free for personal use; **zero auth code** |
| **Speaker diarization** | **Skipped** | No free always-on option exists (Section 8) |

Flow: React (Cloudflare Pages) → Cloudflare Worker → LLM → JSON → Neon. Gated by Cloudflare Access so only your email opens it. Edge-hosted + fast DB wake = snappy.

---

## 8. How Capture Gets In

**Primary: live in-app transcription via the Web Speech API.** Record inside the installed PWA; the browser transcribes in real time, free, into the capture screen. Honest limits (all manageable):
- Auto-stops after ~60s of silence — the app silently restarts recognition on `onend` to keep long sessions going.
- Needs internet (audio goes to Google's free service); no offline.
- No speaker labels.
- Android-Chrome only (works in installed PWAs; blocked in iPhone/Safari PWAs — irrelevant for your Samsung).

**Fallback: paste a transcript** produced elsewhere.

**Speaker diarization — deliberately skipped (no free option).** The Web Speech API can't do it; open-source (pyannote/WhisperX) needs a GPU server (costs money); AssemblyAI/Deepgram only give limited free credits. Attribution is left to the LLM. If ever truly needed, the additive upgrade is a one-off batch diarization of the exported audio before extraction — the rest of the app is unchanged.

---

## 9. Build Roadmap

**Phase 1 — Core loop (both spaces)**
- React PWA on Cloudflare Pages, installable, gated by Cloudflare Access (your email).
- **Workspace switcher** (Work / Personal), data scoped by space.
- Work: live recording + paste, auto-suggested name, auto date/time. Personal: voice brain-dump.
- LLM extraction (Gemini free) via structured output → four categories + TL;DR + priority + auto-set due dates, with source quotes, through the Worker.
- Home/Today, To-Do, Remember (Work), Captures list, Capture detail (quote highlighting). Data in Neon.
- Tick/delete/edit; quick manual add.

**Phase 2 — Genuinely useful**
- **Reminders & notifications:** Web Push, per-item reminders, **8am combined digest** (Work/Personal sections), snooze, **"Did you do it?"** check — via the Cron Worker.
- **Projects + recurring routines** (Personal).
- **Carry-forward** open questions into new captures.
- **Search** + **Ask-your-stuff chat**.
- **Export/backup** (Markdown/JSON) + **share** a meeting summary.
- Overdue highlighting, priority sorting; provider switch (Gemini ↔ Claude ↔ GPT).

**Phase 3 — Power features (optional)**
- **Weekly review + completion stats** ("shipped 4 SaaS tasks, gym 5/7").
- Configurable evening digest; more spaces.
- Integrations (Todoist/Jira/calendar) and fully-offline in-browser transcription — only if ever needed.

---

## 10. Key Considerations & Risks

- **Data sensitivity.** Transcripts/tasks are confidential. Locked to your email via Cloudflare Access; private DB; LLM key only in the Worker.
- **Cost.** Zero — free hosting (Cloudflare), DB (Neon), live transcription (Web Speech API), extraction + chat (Gemini free). Optional pennies if you switch to Claude/GPT.
- **Live transcription limits.** Needs internet, auto-stops on silence (handled by auto-restart), Android-Chrome only. Keep the paste fallback.
- **No speaker labels.** LLM infers; attribution not guaranteed.
- **Notifications.** Web Push needs one-time permission; reminder precision = the Cron Worker's interval (hourly by default; can run more often). iPhone PWA push is unreliable — not relevant for Samsung.
- **Free-tier ceilings.** Gemini free ≈250–1,000 req/day (far above your use). Neon sleeps when idle, wakes in ~1s.
- **Accuracy.** Speech-to-text + AI extraction aren't perfect — edit before extraction; always show the source quote.

---

## 11. Top Recommendations (summary)

1. **Web app as a PWA** on **Cloudflare Pages**, gated by **Cloudflare Access** (your email only) — native-feeling, locked, free.
2. **Two workspaces** (Work / Personal) via a top-right switcher; everything scoped per space, extensible to more.
3. **Work = meeting capture; Personal = voice brain-dump** into tasks, **projects**, and **recurring routines**.
4. **Live in-app transcription** (Web Speech API, free) as primary input; **paste** as fallback. **Skip diarization** (no free option).
5. **Neon** DB (instant wake) + a **Cloudflare Worker** for the LLM call — no server, nothing to pay for.
6. **Gemini free tier** for extraction *and* the ask-anything chat, with **structured output**; provider-swappable to Claude/GPT.
7. Make it feel like an assistant: **Home/Today view**, **auto-set due dates**, **priority**, **TL;DR**, **carry-forward**, **quick add**.
8. **Reminders + 8am combined digest** (Web Push + Cron Worker) with **snooze** and a **"Did you do it?"** check.
9. **Ask-your-stuff chat**, **search**, **export/backup**, **share**, and a **weekly review** with completion stats.
10. Always store the **source quote**; let yourself **edit the transcript before extraction**.
