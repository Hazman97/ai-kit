<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: bring the existing docs into the ai-kit layout (one time)

Use when the user says "migrate the docs", "consolidate the docs", "tidy up the docs", or right after
`ai-kit init` on a project that already had its own docs. Many docs that grew over time (overviews, run
guides, status pages, TODO lists, memory files) say the same thing in different places and drift apart.
This merges what is still true into the few docs of AGENTS.md R23, so every agent reads one place per topic.
It changes no code, and it deletes nothing without the user's OK.

## 1. Inventory (read only)
Read every Markdown doc: root `*.md` (except AGENTS.md, CLAUDE.md, GEMINI.md, CHANGELOG.md, LICENSE) and
`docs/**/*.md`. For each one, note its topics. Then show the user a table, and **stop until they agree**:

| Old doc | What it holds | Goes to | Why |
|---|---|---|---|

Where each topic goes:
| Topic | Target |
|---|---|
| What the app is, stack, commands, folder structure, key decisions, features not built yet | `docs/PROJECT.md` |
| Endpoints, events, payloads, API auth | `docs/API.md` (sections of `api-setup.md`) |
| Tables, schema, migrations, stored files, CRUD per table | `docs/DATABASE.md` (sections of `database-setup.md`) |
| Design system, styling and phone rules | `docs/FRONTEND.md` (sections of `frontend-setup.md`) |
| Env variables, deploy, servers, Docker, mobile/app-store builds, security | `docs/OPS.md` |
| Install and run for a newcomer | `README.md` (short; link to `docs/PROJECT.md` for the rest) |
| A mistake that will happen again, a correction from the user | `LEARNINGS.md`, **only entries the user approves** (R21) |
| Open TODOs, planned features | `docs/PROJECT.md` → "Not done yet" (open items only) |
| Finished-task logs, "last working state", session memory, dated status reports | nowhere: git history keeps them; say so in the table |
| A large topic that fits none of these (user flows, a hardware setup guide) | keep it as its own doc, under its current name (R23) |

## 2. Write the new docs (after the user agrees)
- Use the section layout of `docs/PROJECT.md` and of the matching `*-setup.md` prompt. Where a target doc
  already exists, merge into it; do not start it over.
- **Check every fact against the code before you copy it** (R6): stack versions, commands, routes, tables,
  env variable names. Old docs are often out of date. Fix what is wrong and list it in your report; mark
  what you cannot confirm with `⚠️ Unconfirmed`.
- When two old docs disagree, the code decides. If the code cannot decide, write both and ask.
- Never drop a gotcha, a decision with its reason, or a known limit: nobody can rebuild those from the code.
- Feature lists say what works today. Planned or half-built features are marked **planned**.
- Never copy secret values, tokens or real user data. Name env variables only.
- Relative links only (`docs/API.md`), never `file:///` paths. Fix links in README and the kept docs that
  pointed at the old files.
- Keep the docs' language as the project writes them (AGENTS.md R1).

## 3. The old files (ask first: R17)
List the old docs whose content now lives elsewhere, and ask: "delete these? (git history keeps them)".
Delete only what the user approves, with `git rm` when the repo uses git. Leave the rest untouched.

## 4. Finish
- Refresh the Docs Index: run `npx github:Hazman97/ai-kit doctor --fix` (or ask the user to run it), then
  write a real "Open when…" for any row that still says "edit this line".
- Report:
  - the table of old doc → new place,
  - facts you corrected because the code disagreed, and what is still unconfirmed,
  - anything you left out and why,
  - proposed `LEARNINGS.md` entries (not written until the user agrees).
