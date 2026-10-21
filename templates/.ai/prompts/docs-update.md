<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: update the docs (sync docs with code)

Referenced by AGENTS.md R25. Use when the user says "update the docs", "docs are outdated",
"regenerate docs", or "sync docs with code".

## Core rules
1. **Update only, never rewrite.** Read the existing doc first. Keep its structure, headings and order.
   Change only what really changed. Do not remove a section just because you did not write it.
2. **Check every claim against the code.** Every number, file name, config key, env var name, endpoint,
   event and function name must be confirmed from the real source, not from memory or this conversation.
   The safest way is a tiny script that reads the config/code and compares it with the doc, for example:
   ```bash
   node -e "const c=require('./config.js');const d=require('fs').readFileSync('docs/OPS.md','utf8');console.log(d.includes(String(c.port))?'OK port':'MISMATCH port')"
   ```
3. **Mark uncertainty; never guess.** If something cannot be confirmed, write it so:
   > ⚠️ Unconfirmed: the retry count of the upload worker is not set anywhere obvious.

   A confidently wrong doc is worse than an honest incomplete one.
4. **Never expose secrets.** Name environment variables, never their values. Never copy `.env`.
   Examples use placeholders (`https://api.example.com`, `DATABASE_URL=postgres://user:pass@host/db`).
   Sections about auth or credentials get a short warning line for reviewers.
5. **Separate built from planned.** Features that are designed but not built are marked **planned**, so a
   reader can trust that everything unmarked really works.
6. **Match the repo's conventions** (language of docs, headings, tables for anything repeated).
   Use relative links (`docs/API.md`, `src/app.ts`), never absolute `file:///` paths.

## Which doc to update (create a new one only if the user agrees: AGENTS.md R23)
| Doc | Update when |
|---|---|
| `README.md` | setup, scripts or folder structure change |
| `docs/PROJECT.md` | stack, commands, structure, key decisions, "not done yet" change |
| `docs/API.md` | endpoints, events, payload shapes or auth of the API change |
| `docs/DATABASE.md` | tables/collections, fields, migrations or anything written to disk change |
| `docs/FRONTEND.md` | design tokens, components, styling rules or phone rules change |
| `docs/OPS.md` | env vars, ports, deploy steps, servers, auth/security handling change |
| `AGENTS.md` → Docs Index | a doc was added or removed |
| `LEARNINGS.md` | **only after the user agrees** (R21) |

## Procedure
1. Read `AGENTS.md` and the target docs.
2. Find what really changed since the last update (`git log -- <paths>` and `git diff` help).
3. Update only the affected files and sections.
4. Run the cross-checks against the code.
5. Report: what you updated, what you verified (and how), what is still unconfirmed.

## Never
- Regenerate a file from scratch.
- Copy numbers from the conversation instead of reading the code.
- Document planned features as if they exist.
- Write `LEARNINGS.md` without the user's explicit OK.
- Leave an old claim that is now wrong.
