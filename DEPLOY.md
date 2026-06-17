# Deploy checklist — 4 manual steps then done

VAPID keys are pre-generated. Follow the steps in order.

---

## Step 1 — Neon database (2 min)

1. Go to https://neon.tech → sign in → New project → name it "meeting-assistant" → Create
2. Click **Connect** → copy the **Pooled** connection string → save as `DATABASE_URL`
3. Click **Connection details** → toggle **Direct** → copy → save as `DATABASE_URL_UNPOOLED`
4. Run migration (one-time):
   ```
   DATABASE_URL_UNPOOLED="<paste direct URL>" npx drizzle-kit migrate
   ```

---

## Step 2 — Gemini API key (1 min)

1. Go to https://aistudio.google.com/app/apikey → Create API key → copy it

---

## Step 3 — Local dev test

Copy `.dev.vars.example` → `.dev.vars` and fill in the two values:

```
cp .dev.vars.example .dev.vars
# edit .dev.vars: paste DATABASE_URL and GEMINI_API_KEY
```

Then run:
```
npx wrangler dev
```

Open http://localhost:8787 → switch to Work space → paste a meeting transcript → Extract & Save. Verify it appears on Home, Todo, Remember, Captures.

---

## Step 4 — Deploy to Cloudflare (5 min)

```bash
# Login (opens browser)
npx wrangler login

# Deploy
npx wrangler deploy
```

Copy the hostname shown (e.g. `meeting-assistant.yourname.workers.dev`).

### Set secrets (paste each when prompted):
```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put CF_ACCESS_TEAM
npx wrangler secret put CF_ACCESS_AUD
```

For VAPID_PRIVATE_KEY: paste the private key from `.dev.vars.example` (gitignored, not in this repo)

### Set plain vars in wrangler.jsonc (not secrets):
Add these to the `[vars]` section:
```
VAPID_PUBLIC_KEY = "BGu0F-74-Ijnw08IeA7mF1ufQJ7ThgBMDM9RuODOSxVpuWaFknVDRmrqILdQK7T2zP6v5VI1DggtrxEPLxcDzoQ"
VAPID_SUBJECT = "mailto:sharuk205343@gmail.com"
```

### Configure Cloudflare Access (gates to your Gmail only):
1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → Add an application
2. Type: **Self-hosted**
3. Application name: `Meeting Assistant` / Domain: your workers.dev hostname
4. Identity providers: **Google**
5. Policy: Action = Allow, Selector = **Emails** → `sharuk205343@gmail.com`
6. Save → copy the **Audience (AUD) tag** from the application overview
7. Your team name is the subdomain at https://one.dash.cloudflare.com (e.g. `yourteam.cloudflareaccess.com` → team = `yourteam`)
8. Set those as secrets: `wrangler secret put CF_ACCESS_TEAM` (paste `yourteam`) and `wrangler secret put CF_ACCESS_AUD` (paste AUD tag)

### Redeploy after secrets:
```bash
npx wrangler deploy
```

Open the workers.dev URL → it should redirect you to Google login → after auth you land on the app.

---

## VAPID keys (already generated — keep private key secret)

Public key is pre-set in `wrangler.jsonc` under `[vars]`.
Private key is in `.dev.vars.example` (gitignored) — use it for `wrangler secret put VAPID_PRIVATE_KEY`.
