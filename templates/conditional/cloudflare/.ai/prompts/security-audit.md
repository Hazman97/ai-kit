<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: security audit (Cloudflare project)

Use when the user asks for a security audit, a pen test, "is this safe to ship", or before the first production
deploy (AGENTS.md R26). This project deploys to Cloudflare; ai-kit wrote this prompt for that reason only.
Detected by ai-kit: {{CLOUDFLARE_DETECTED}}

The engine is Cloudflare's own skill, `security-audit` (github.com/cloudflare/security-audit-skill, MIT). It has
no Cloudflare-specific checks, so this prompt adds a checklist for the platform on top of it.

## SAFETY (read first; the same rules as `audit.md`)
- Never deploy, never run `wrangler deploy`, `wrangler d1 execute --remote`, `wrangler r2`/`kv` against the account,
  and never call production or preview URLs. Read code and config; run only what stays on this machine.
- Run the app only with `wrangler dev --local` and fake secrets in a throwaway `.dev.vars` (deleted afterwards).
  Point every outbound integration (email, Telegram, payment, webhooks) at a dead address.
- Never print secret values: name variables and bindings, never their values.
- The skill does not run target code without an OS sandbox. A lead it cannot run stays `needs_validation`; that is
  expected here. Do not install Docker or anything else to get around it.

## Step 1: is the skill installed?
Look for `security-audit/SKILL.md` in the project (`.claude/skills/`, `.agents/skills/`) and in your agent's global
folder (`~/.claude/skills/`, `~/.gemini/skills/`, `~/.gemini/config/skills/`, `~/.agents/skills/`,
`~/.cursor/skills/`).
- **Installed:** use it. A question or a focused review is the skill's *guidance mode*. A full audit (all six
  phases, report files) only when the user asks for an audit or a pen test; if unsure which, ask one question.
- **Not installed:** tell the user the one command that installs it for this project, and **ask before running it**:
  `npx github:Hazman97/ai-kit update --security-skill` (needs Node.js 22.20+; it downloads the skill from GitHub).
  Never install it silently. If they say no, do Step 2 on its own and say the skill's phases were not run.

## Step 2: the Cloudflare checklist
Give these to the skill as extra hunting areas (or work through them yourself when the skill is missing). For every
item, say the file and line you checked, or why it does not apply. Skip whole sections for products this project
does not use.

**Exposure**
- `workers_dev` (on unless the config says `false`) and preview URLs: an Access application or WAF rule on the
  custom domain does not cover them. Either Access is turned on for those URLs too (Worker → Settings → Domains &
  Routes), or they are off. You cannot see that dashboard setting from the code: ask the user, do not assume.
- Routes and custom domains outside the Access application's path; path gaps (`/admin` vs `/admin/`, letter case,
  encoded slashes).
- Pages: `_routes.json` include/exclude and `_middleware` that leave a function unguarded.

**Auth**
- An Access JWT (`Cf-Access-Jwt-Assertion`) must be *verified*: signature against the team's JWKS, `aud`, `iss`,
  expiry, then the email or groups. A header that is only present proves nothing.
- Every route has a guard; owner-only actions check the owner, not just "signed in".
- CSRF on cookie-auth forms; CORS `*` together with credentials.

**Secrets**
- Secrets in `vars` (plain text in the config) instead of `wrangler secret put`.
- `.dev.vars` committed to git.
- Secrets in `console.log`, error bodies or Logpush; tokens sent to the browser.

**Inbound webhooks**
- Signature checked before anything else, with a constant-time compare (Telegram `secret_token`, Stripe-style
  `v1=` HMAC); a replay window; idempotency on retries.

**D1**
- Only `prepare().bind()`; never SQL built from strings.
- Check-then-write races without a unique index or `batch()`; money stored as floats.

**R2 / KV**
- Public buckets or `r2.dev` access; object keys built from user input.
- Upload type and size limits; user-uploaded HTML or SVG served from the app's origin; signed URL expiry.

**Email Workers**
- Trust only the authentication results Cloudflare adds (DKIM/SPF/DMARC), never headers the sender wrote;
  `message.from` can be spoofed.
- Size limits; forwarding loops.

**Durable Objects / Queues / Cron**
- Object ids taken from user input; auth checked inside each object.
- Retries and poison messages; cron jobs safe to run twice.

**Outbound fetch**
- SSRF through user-supplied URLs (webhook targets, image proxies); https only; redirects followed blindly.

**Abuse and cost**
- The Rate Limiting binding or WAF rules on public routes.
- CPU-heavy routes (image rendering, wasm) reachable without auth; subrequest limits.

**Output**
- HTML escaping and a CSP on server-rendered pages; escaping in Telegram or Slack messages.

**Config**
- `compatibility_date` age, `nodejs_compat`; `npm audit --omit=dev`.

## Step 3: the report
- With the skill in full audit mode: its run folder (`~/security-audit-skill/<repo>/run-N`), outside the repo.
  Inside the repo only if the user picks a folder that git ignores.
- Without the skill: one Markdown report outside the repo (or in `.ai/tmp/`), with each finding's file and line,
  severity, a safe way to reproduce it, and the smallest fix. List what you could not verify.
- Do not fix anything during the audit. Offer the fixes afterwards, most severe first.
