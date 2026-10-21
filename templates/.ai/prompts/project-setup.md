<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: set up the project docs (first time)

Use when the user says "setup the project docs", "fill PROJECT.md", or right after `ai-kit init`.
This writes `docs/PROJECT.md` from the code. It does not change any code.

## Steps
1. Read `AGENTS.md`, `README.md`, the package/config files (package.json, pyproject, go.mod, Dockerfile,
   vite/next/nuxt config…), the entry points and the top-level folders.
2. Fill every `_Not written yet._` part of `docs/PROJECT.md`:
   - **What it is:** 2–4 sentences, from README and the code (routes, screens, models).
   - **Stack:** check the detected list; correct it from the real config and versions.
   - **Commands:** dev, build, test, lint, typecheck, deploy: only commands that exist (scripts, Makefile),
     including each sub-package's (`cd worker && npm run deploy`).
     Run the quick ones (typecheck, lint) to confirm they work; say which you did not run.
   - **Structure:** the folders a newcomer needs, one line each.
   - **Key decisions:** only what you can see in code/config/comments, with the reason if stated.
   - **Not done yet:** TODOs, stubbed routes, mock data, features named in README but missing in code.
3. Do not guess. Where you cannot confirm something, write `⚠️ Unconfirmed: …`.
4. Never write secret values: name environment variables only (`DATABASE_URL`), never their values.
5. If the project clearly needs another doc now (an API with many endpoints, a database schema, a
   frontend with its own design system, a deployment), say which one and ask before creating it
   (AGENTS.md R23). Do not create it unasked. Each has its own prompt in `.ai/prompts/`:
   `api-setup.md` → `docs/API.md`, `database-setup.md` → `docs/DATABASE.md`, `frontend-setup.md` →
   `docs/FRONTEND.md`.
6. Update the Docs Index in `AGENTS.md` if you created a doc (or ask the user to run `ai-kit doctor --fix`).

## Report back
- What you filled, what you checked by running commands, and what is marked unconfirmed.
- Suggested next docs (if any), with one line on why.
