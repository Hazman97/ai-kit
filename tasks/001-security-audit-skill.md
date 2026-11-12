# Task 001 (ai-kit 1.3.0): Cloudflare's security-audit skill for Cloudflare projects

Read `README.md`, `lib/commands.js`, `lib/detect.js`, `templates/AGENTS.md`, `templates/.ai/prompts/audit.md` and
`test/kit.test.js` first. Follow the code around you: zero dependencies, `node:test`, Plan/dry-run for every write.
Write `tasks/001-report.md`. Do not commit.

## Why
The owner (2026-10-29) wants every project that runs on Cloudflare (Workers, Pages, D1, R2, KV, Durable Objects,
Email Workers, Access) to get a proper security audit. The tool is **Cloudflare's own skill**:
- source: `https://github.com/cloudflare/security-audit-skill`, MIT, skill `security-audit`;
- it has a guidance mode and a 6-phase full audit with independently verified findings;
- reports go to `~/security-audit-skill/<repo>/run-N`;
- it never runs target code without an OS sandbox; leads it cannot run stay `needs_validation`. This is fine: the
  owner uses no Docker.

The skill has **no Cloudflare-specific checks**, so ai-kit adds a Cloudflare checklist on top of it.

## Owner rule (most important)
**Only projects that deploy to Cloudflare get any of this.** A project whose stack has nothing to do with Cloudflare
must look exactly as it does with ai-kit 1.2.0:
- no `security-audit.md` prompt;
- no rule line or prompt row in AGENTS.md;
- no next step and no doctor finding about the skill.

`--security-skill` on such a project installs nothing; it prints "not a Cloudflare project, skipped" and exits 0.

**What counts as Cloudflare:** any part of the project (root or a sub-package) matches the detection in Build 1.
**Changes over time:**
- A project that becomes Cloudflare later gets the prompt on the next `update`.
- A project that stops being Cloudflare keeps the files it already has (ai-kit never deletes), but `doctor`
  stops nagging.

## Facts (checked 2026-10-29)
- **Install** (Vercel's skills CLI, MIT):
  `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit -a <agent>`.
  - Without `-g` it installs into the project; `-g` installs globally.
  - Agent ids: `claude-code`, `gemini-cli`, `antigravity`, `codex`, `cursor`.
- **Project paths:** Claude Code `.claude/skills/`; Gemini CLI / Antigravity / Codex / Cursor share `.agents/skills/`.
- **Global paths:** `~/.claude/skills/`, `~/.gemini/skills/`, `~/.gemini/antigravity/skills/`, `~/.agents/skills/`,
  `~/.cursor/skills/`.
- **Unverified:** run `npx skills --help` and `npx skills add --help` yourself and paste the output in the report.
  It is not confirmed whether `-y` / non-interactive mode exists for `add`, or whether a ref/commit can be pinned.
  Build on what the help really says.
- **Current detection:** `detect.js` sets `platform = "Cloudflare Workers"` only when the `wrangler` dependency is
  present. `WRANGLER_FILES` exists but only feeds the storage bindings.

## Build
1. **Detection** (`detect.js`, tested): a project or sub-package is **Cloudflare** when any of these hold:
   - it has the `wrangler` dependency;
   - it has a `wrangler.toml|json|jsonc`;
   - it has `@cloudflare/*` dependencies;
   - it has a Pages `functions/` dir together with `_routes.json` / `_worker.js`.

   Add `facts.cloudflare = {products: [...]}`: Workers / Pages / D1 / KV / R2 / Durable Objects / Queues / Email
   Workers (`send_email` or an `email()` handler export) / Access (`jose` + `Cf-Access-Jwt-Assertion` in source).
2. **New managed prompt `security-audit.md`**, written **only for Cloudflare projects**. Keep it out of the generic `templates/.ai/prompts/` walk, e.g. `templates/conditional/cloudflare/.ai/prompts/security-audit.md`. `init` and `update` copy it only when `facts.cloudflare`; otherwise it is managed like the others.
   - **Step 1:** check whether the skill is installed. Look for `security-audit/SKILL.md` under `.claude/skills/`,
     `.agents/skills/`, or the agent's global path from the table above.
     - Installed → use it: guidance mode for questions, full audit mode when the user asks for an audit.
     - Not installed → tell the user the exact install line for their agent and **ask before running it**. Never
       install silently.
   - **Step 2:** the **Cloudflare checklist**, passed to the skill as extra hunting areas, or used alone when the
     skill is missing. Each item must point to the file/line it checked. Items:
     - **Exposure:**
       - `workers_dev` / preview URLs left on bypass Cloudflare Access and the WAF;
       - routes / custom domains outside the Access path; path-matching gaps (`/admin` vs `/admin/`, case);
       - Pages `_routes.json` / `_middleware` bypasses.
     - **Auth:**
       - the Access JWT must be *verified* (signature via the team JWKS, `aud`, `iss`, expiry, email), not just
         present;
       - every route has a guard; owner-only actions;
       - CSRF on cookie-auth forms; CORS `*` together with credentials.
     - **Secrets:**
       - secrets in `vars` instead of `wrangler secret`;
       - `.dev.vars` committed;
       - secrets in logs / `console.log` / error bodies / Logpush;
       - tokens sent to the browser.
     - **Inbound webhooks:** signature check, constant-time compare, replay window, idempotency (Telegram
       `secret_token`, Stripe-style `v1=` HMAC).
     - **D1:**
       - only `prepare().bind()`, never string-built SQL;
       - check-then-write races without a unique index / `batch`;
       - money as floats.
     - **R2 / KV:**
       - public buckets / `r2.dev`;
       - object keys built from user input;
       - upload type and size limits; content-type sniffing / serving user HTML;
       - signed URL expiry.
     - **Email Workers:**
       - trust only Cloudflare-added authentication results (DKIM/SPF/DMARC), not headers the sender can write;
       - `message.from` can be spoofed;
       - size limits; forwarding loops.
     - **Durable Objects / Queues / Cron:**
       - object ids from user input;
       - per-object auth;
       - retries and poison messages;
       - idempotent cron jobs.
     - **Outbound fetch:** SSRF via user-supplied URLs (webhook targets); https only; redirects.
     - **Abuse and cost:**
       - the Rate Limiting binding / WAF rules on public routes;
       - CPU-heavy routes (image rendering, wasm) reachable without auth;
       - subrequest limits.
     - **Output:** HTML escaping / CSP on server-rendered pages; Telegram/Slack text escaping.
     - **Config:** `compatibility_date` age, `nodejs_compat`, dependency audit (`npm audit --omit=dev`).
   - **Same SAFETY rules as `audit.md`:**
     - never deploy, never touch the remote D1 / R2 / KV, never call production URLs;
     - `wrangler dev --local` only, with fake secrets.

     The report goes outside the repo (the skill's default) unless the user picks a git-ignored folder.
3. **`AGENTS.md` template, only for Cloudflare projects:** the prompt row in the "Prompts for bigger jobs" table + the rule line below, rendered through a conditional placeholder in `render.js` (empty for other projects; a test proves a non-Cloudflare AGENTS.md is byte-identical to 1.2.0's apart from the version number).
   - Add one rule line: for Cloudflare projects, offer `security-audit.md` once before the first production deploy
     and after big auth / route changes, and only run it when the user agrees.
   - Bump the rules block version to 1.3.0.
4. **`init` / `nextSteps`:** for a Cloudflare project, add a step: say `follow .ai/prompts/security-audit.md`, and
   list the install line, only when the skill is not installed in the project.
5. **New opt-in flag** `init --security-skill` (also `update --security-skill`):
   - It runs the install for the agents this project uses, at project scope:
     - `claude-code` when CLAUDE.md exists;
     - `gemini-cli` + `antigravity` when GEMINI.md exists;
     - `codex` / `cursor` only if their files exist.
   - Use `spawnSync("npx", [...], {shell: false, stdio: "inherit"})`; on Windows use `npx.cmd`.
   - Respect `--dry-run`: print the command, run nothing.
   - On failure, show the error and continue; the rest of init still applies.
   - Record `{security_skill: {installed_at, agents}}` in `.ai/ai-kit.json`.
   - **Without the flag nothing is installed or downloaded.** ai-kit stays zero-dependency and offline.
6. **`doctor`** (the `.dev.vars` error applies to any project that has the file; the other two only to Cloudflare projects):
   - **error** when `.dev.vars` or `*.dev.vars` is tracked by git (the same style as the `.env` check);
   - **warn** when a wrangler config has `workers_dev = true` (or omits it, since the default is on) while the code
     verifies Access JWTs (Access is bypassed on workers.dev);
   - **info** for a Cloudflare project without the skill installed (fix: `ai-kit update --security-skill`).
7. **`.gitignore` block:** nothing new. The skill writes its reports to the home folder.
8. **Docs:**
   - README: the command table, "What you get", a short "Security audit (Cloudflare)" section and the Malay summary;
   - `docs/index.html`: one card;
   - `package.json` version 1.3.0.

## Tests (`node --test`, zero dependencies)
- **Detection:**
  - a wrangler.toml with no wrangler dependency → cloudflare;
  - Pages functions;
  - email handler; Access;
  - a non-Cloudflare project → none.
- **init:**
  - a Cloudflare project creates `.ai/prompts/security-audit.md` and has the next step;
  - with the skill folder faked in `.claude/skills/security-audit/SKILL.md`, the next step does not list the install
    line;
  - a non-Cloudflare project (plain Vue / Laravel / Python fixtures) gets **no** prompt, no AGENTS.md row or rule, no next step, and no doctor info. Its full init output equals 1.2.0's apart from the version.
- **`--security-skill` on a non-Cloudflare project:** prints "skipped", spawns nothing, exit 0.
- **A sub-package that is Cloudflare** (e.g. `worker/` with wrangler.toml inside a Vue repo) counts for the whole project.
- **`--security-skill --dry-run`:** the planned commands per agent set (CLAUDE.md only; CLAUDE.md + GEMINI.md), and
  nothing is spawned. Inject the runner so tests never call npx.
- **doctor:**
  - tracked `.dev.vars` → error (init a temp git repo, as the `.env` test does);
  - `workers_dev` + Access code → warn;
  - a missing skill → info.
- **Unknown flags:** still refused before writing (the existing CLI test pattern).

## Proof for the report
- `npm test`: paste the final lines.
- `node bin/ai-kit.js init --dir ../bijokpay --dry-run` and `node bin/ai-kit.js doctor --dir ../bijokpay`: paste the
  output.
  - bijokpay is the owner's new Cloudflare repo. **Dry-run only; do not write into it.**
- **One real install in a temp folder** (outside every repo): `init --security-skill` on a scratch Cloudflare
  project. List the files that landed in `.claude/skills/` and `.agents/skills/`.
- The `npx skills --help` output.
- What you did not check.

---
**Prompt for Gemini:**
> In the ai-kit repo, read `tasks/001-security-audit-skill.md` and do it. Zero dependencies, dry-run first, never
> write into other repos except the temp folder the task names. Write `tasks/001-report.md`. Do not commit.
