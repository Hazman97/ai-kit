# Report: Task 001, Cloudflare's security-audit skill (ai-kit 1.3.0)

Branch `feat/cloudflare-security-skill` (from `2bfdf10`). Nothing committed, as the task asks.

## What was built
- **Detection** (`lib/detect.js`): a package is Cloudflare when it has the `wrangler` dependency, a
  `wrangler.toml|json|jsonc`, an `@cloudflare/*` dependency, or Pages (`pages_build_output_dir`, a `wrangler pages`
  script, or `functions/` with `_routes.json` / `_worker.js`, also under `public/`). Per package:
  `{products, access, workersDev}`; for the project: `facts.cloudflare = {products, paths, access,
  accessOnWorkersDev}` or `null`. Products: Workers, Pages, D1, KV, R2, Durable Objects, Queues, Email Workers,
  Access. The source is read (bounded: 400 files, 256 KB each, depth 4) only for a Cloudflare package, so other
  projects cost nothing extra. The stack gains a `Cloudflare: …` line for those packages.
- **Prompt** `templates/conditional/cloudflare/.ai/prompts/security-audit.md`: left out of the main template
  walk, copied by `init` and `update` only when `facts.cloudflare`, then managed like the other prompts. Step 1
  checks for the skill and asks before installing; Step 2 is the full Cloudflare checklist; SAFETY repeats
  `audit.md`'s rules plus no deploy / no remote D1, R2, KV / `wrangler dev --local` with fake secrets.
- **AGENTS.md**: `{{CLOUDFLARE_RULE}}` (a `### Security (Cloudflare)` heading and **R26**) and
  `{{CLOUDFLARE_PROMPT_ROW}}` sit at the end of existing lines, so for other projects they vanish without a
  blank line. Rules block version is now 1.3.0.
- **nextSteps**: Cloudflare projects get `follow .ai/prompts/security-audit.md`; the install line is in it only
  while the skill is missing (project or global folders).
- **`--security-skill`** on `init` and `update`: one call,
  `npx -y skills add cloudflare/security-audit-skill@c1c8a8c1471069fb0e188eeaff69b8e8db6564a8 --skill security-audit -a <agents> -y --copy`
  with `DISABLE_TELEMETRY=1`, `cwd` = the project. Agents: `claude-code` (CLAUDE.md), `gemini-cli` + `antigravity`
  (GEMINI.md), `codex` (`.codex/`), `cursor` (`.cursor/` or `.cursorrules`); files this run creates count.
  `--dry-run` prints the command and spawns nothing; not Cloudflare prints "skipped" and exits 0; a failure is
  reported and the rest of the run still applies. `.ai/ai-kit.json` gets
  `security_skill: {installed_at, agents, ref}`, kept by later runs. The runner is injectable; tests never call npx.
- **doctor**: error for a tracked `.dev.vars` / `*.dev.vars` / `.dev.vars.*` (not `.example`/`.sample`/`.template`)
  in **any** project; warn when a Worker checks Access JWTs and its workers.dev URL is on; info when a Cloudflare
  project lacks the skill.
- **Docs**: README (tree, commands table, new "Security audit (Cloudflare projects)" section, Malay summary),
  `docs/index.html` (one card, the prompts line), `package.json` 1.3.0.

## Where I departed from the task, and why
1. **`shell: true` on Windows** instead of `shell: false` + `npx.cmd`. Since the fix for CVE-2024-27980
   (Node 18.20.2 / 20.12.2 / 21.7.3 and later), Node refuses to spawn a `.cmd` without a shell (`EINVAL`). Every
   argument is a constant in ai-kit, no user input, so the shell adds no injection path. POSIX keeps `shell: false`.
2. **The skill is pinned** to commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (the repo's `main`, 2026-09-14).
   The CLI supports `owner/repo@<tag|commit>`; a pin means every project gets files someone reviewed. Bump
   `SKILL.ref` in `lib/commands.js` to take a newer skill.
3. **`--copy`**: symlinks on Windows can need Developer Mode; copies always work.
4. **Telemetry off** (`DISABLE_TELEMETRY=1`): the `skills` CLI collects usage data by default.
5. **Node check**: the `skills` CLI needs Node.js 22.20+, while ai-kit runs on 18+. Older Node gets a note with
   the command and nothing is spawned.
6. **Antigravity's global path is `~/.gemini/config/skills/`**, not `~/.gemini/antigravity/skills/` (from the
   CLI's `docs/agents.md`). `skillInstalled` checks `~/.claude/skills`, `~/.gemini/skills`,
   `~/.gemini/config/skills`, `~/.agents/skills`, `~/.cursor/skills`, `~/.config/agents/skills` and the
   project's `.claude/skills`, `.agents/skills`.
7. **workers.dev wording**: Cloudflare can now put Access in front of a workers.dev URL too (Worker → Settings →
   Domains & Routes). The doctor warning and the checklist say an Access app on the custom domain does *not cover*
   workers.dev, and tell the agent to ask, since that dashboard setting is not visible in code.
8. **Access detection** uses the `Cf-Access-Jwt-Assertion` header in source, with or without `jose`: some code
   verifies with WebCrypto directly.

## Facts about the `skills` CLI (from its README, `docs/commands.md`, `docs/agents.md`; npm `skills` 1.8.1)
`npx skills --help` itself was **not run**: running a downloaded package was blocked in this session (see below).
What the docs say:
- `add` options: `-g/--global`, `-a/--agent <agents...>`, `-s/--skill <skills...>`, `-l/--list`, `--copy`,
  `-y/--yes` ("Skip all confirmation prompts"), `--all`. Example: `npx skills add … --skill frontend-design -g -a claude-code -y`.
- Pinning: `npx skills add owner/repo@v1.2.3 --skill my-skill` ("Pin a release tag or full commit").
- Project scope is the default (`./<agent>/skills/`), `-g` is global. Requires Node.js 22.20 or later.
- Telemetry: off with `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`.
- Paths: Claude Code `.claude/skills/` (global `~/.claude/skills/`); Gemini CLI, Antigravity, Codex, Cursor
  `.agents/skills/` (globals `~/.gemini/skills/`, `~/.gemini/config/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`).

## Proof
### `npm test`
```
✔ cli: --security-skill is a known option; a typo of it is refused (171.0698ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2678.3938
```
6 new tests: detection (wrangler config without the dependency, Pages, email handler, Access, workers_dev off,
a `worker/` sub-package, three non-Cloudflare stacks); Cloudflare init (prompt, row, R26, next step with and
without a faked `.claude/skills/security-audit/SKILL.md`, a project that becomes Cloudflare later); non-Cloudflare
(no prompt, no trace in AGENTS.md, no next step, no doctor note, `--security-skill` spawns nothing); the install
(dry-run spawns nothing, the exact command, `npx.cmd` on Windows, `DISABLE_TELEMETRY`, the meta record, CLAUDE.md
only, a failed install); doctor (`.dev.vars` incl. `worker/.dev.vars` and not `.example`, workers.dev + Access,
missing skill); the CLI flag and a typo of it.

### Non-Cloudflare projects are unchanged
1.2.0 (`2bfdf10`, in a temporary worktree) and this build ran `init` on identical Vue + Tailwind, Laravel (Pint,
Blade) and FastAPI fixtures. File lists identical, file contents identical apart from the version lines and the
`updated` date, CLI output identical apart from the version number.

### `node bin/ai-kit.js init --dir ../bijokpay --dry-run` (bijokpay's git status was clean before and after)
```
Project: bijokpay
  · Runtime: Node.js + TypeScript (package manager: npm)
  · `root` (backend): Backend: Hono on Cloudflare Workers · Cloudflare: Workers, D1, R2, Email Workers, Access · Data: Cloudflare D1, R2 · Tests: vitest
  · `client/` (package): Tests: vitest
  · Layout: 1 package (`client/`)
  · commands: dev = npm run dev, test = npm run test, typecheck = npm run typecheck, deploy = npm run deploy

Files:
  ~ updated  .ai/prompts/api-setup.md
  = kept     .ai/prompts/audit.md  (up to date)
  ~ updated  .ai/prompts/database-setup.md
  = kept     .ai/prompts/docs-migrate.md  (up to date)
  = kept     .ai/prompts/docs-update.md  (up to date)
  = kept     .ai/prompts/frontend-setup.md  (up to date)
  = kept     .ai/prompts/project-setup.md  (up to date)
  ~ updated  .ai/prompts/ui-task.md
  = kept     CLAUDE.md  (already imports AGENTS.md)
  = kept     docs/PROJECT.md  (exists, never overwritten)
  = kept     GEMINI.md  (already imports AGENTS.md)
  = kept     LEARNINGS.md  (exists, never overwritten)
  ~ updated  AGENTS.md  (rules block and Docs Index refreshed; Project notes untouched)
  + created  .ai/prompts/security-audit.md
  = kept     .gitignore  (ai-kit block up to date)
  ~ updated  .ai/ai-kit.json

  dry run: nothing was written.
```
`update --dir ../bijokpay --security-skill --dry-run` ends with:
`--security-skill would run: npx -y skills add cloudflare/security-audit-skill@c1c8a8c1471069fb0e188eeaff69b8e8db6564a8 --skill security-audit -a claude-code -a gemini-cli -a antigravity -y --copy`

### `node bin/ai-kit.js doctor --dir ../bijokpay` (before the wording fix in 7 above; the finding is the same)
```
  ! The Worker in root checks Cloudflare Access JWTs but workers.dev is on …
      → set workers_dev = false (and preview_urls = false) unless that URL must stay public
  i Cloudflare project without Cloudflare's security-audit skill.
      → ai-kit update --security-skill
  i Rules are v1.2.0; ai-kit is v1.3.0.
      → ai-kit update
  ! AGENTS.md refers to `tasks/NNN-report.md`, which does not exist.
  ! The Docs Index in AGENTS.md does not match the docs on disk.
  0 error(s), 3 warning(s), 2 note(s).
```
The workers.dev finding is real: `bijokpay/wrangler.jsonc` has `"workers_dev": true` (on purpose, for testing
before the custom domain, per its comment) and `src/routes/admin.ts` reads `Cf-Access-Jwt-Assertion`. Whether
Access is turned on for the workers.dev URL in the dashboard cannot be seen from the repo: check it.
The `tasks/NNN-report.md` warning is doctor reading a pattern in bijokpay's own notes as a file path (existing
behaviour, not part of this task).

## Not done / not checked
- **The real install in a temp folder was not run**, and neither was `npx skills --help`. In this session,
  running `npx skills …` (downloading and executing a package from npm) was blocked by the permission classifier
  as external code. I did not route around it through ai-kit's own `--security-skill`. To finish the proof:
  in an empty folder outside every repo, put a `wrangler.toml` (`name = "t"`, `main = "src/i.ts"`), run
  `node <ai-kit>/bin/ai-kit.js init --security-skill`, and list `.claude/skills/` and `.agents/skills/`.
- The Node < 22.20 path is not covered by a test (the version comes from `process.versions.node`); the install
  test is skipped on such Node versions.
- Detection of Queues, Durable Objects and Pages via `pages_build_output_dir` is by config text and was not
  checked against a real project of each kind.
- bijokpay was only read (dry-run, doctor, its wrangler config); nothing was written to it.
