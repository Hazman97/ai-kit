# ai-kit

One command gives any project the same AI-agent setup, so Claude Code, Gemini / Antigravity, Codex and
Cursor all follow the same rules, read the same docs and use the same proven prompts.

```bash
npx github:Hazman97/ai-kit init
```

No install, no dependencies: Node.js 18+ is enough.

## What you get

```
your-project/
├── AGENTS.md            ← the rules every agent follows (one source for all of them)
├── CLAUDE.md            ← "@AGENTS.md" (Claude Code reads AGENTS.md through it)
├── GEMINI.md            ← "@./AGENTS.md" (Gemini CLI / Antigravity too)
├── LEARNINGS.md         ← mistakes worth remembering; agents add entries only with your OK
├── docs/
│   └── PROJECT.md       ← the one base doc: what it is, stack, commands (filled for you), structure
└── .ai/
    ├── ai-kit.json      ← version + what was detected
    └── prompts/         ← tools for bigger jobs, used when you ask for them
        ├── project-setup.md   fill docs/PROJECT.md from the code
        ├── docs-update.md     sync docs with code (update only, verify every claim)
        ├── frontend-setup.md  write docs/FRONTEND.md (design tokens, Tailwind rules, phone rules)
        ├── ui-task.md         hand UI work to another agent: logic first, look second, screenshots as proof
        └── audit.md           a production-safe audit: static + API contract + running the app
```

### The ideas behind it
- **Few docs, always true.** One base doc (`docs/PROJECT.md`). Other docs (`API`, `DATABASE`, `FRONTEND`,
  `OPS`) are created only when the project needs them. The Docs Index in `AGENTS.md` lists only files that
  exist, so agents never chase a doc that is not there.
- **Rules that hold up:** verify before saying "done", fix root causes, never commit or run destructive
  commands without asking, secrets never in code, phone-width and light/dark checks for every screen.
- **Your text is yours.** ai-kit only changes its own marked blocks. Everything else (your Project notes,
  `LEARNINGS.md`, `docs/PROJECT.md`, prompts you edited) is never overwritten.

## Commands

Run them inside the project folder (or pass `--dir <path>`).

| Command | What it does |
|---|---|
| `npx github:Hazman97/ai-kit init` | Detects the stack (Vue/React/Next/Nuxt/Svelte…, Tailwind v3/v4, package manager, scripts) and adds the files above. Existing files are kept. |
| `npx github:Hazman97/ai-kit init --merge` | Also converts an existing `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`: adds the rules and the import line, keeps your own sections, saves `*.ai-kit-backup` copies. |
| `npx github:Hazman97/ai-kit update` | Newer rules and prompts from this repo. Your notes and your own prompts are not touched. |
| `npx github:Hazman97/ai-kit doctor` | Checks: docs referenced but missing, unfilled placeholders, old doc names, a stale Docs Index, agents that do not read AGENTS.md, a long LEARNINGS.md, and **`.env` files committed to git**. Exit code 1 on errors (handy in CI). |
| `npx github:Hazman97/ai-kit doctor --fix` | Also regenerates the Docs Index. |

Add `--dry-run` to any command to see what would change without changing anything.

## After `init`

Open the project with your agent and say:

1. `follow .ai/prompts/project-setup.md` → it fills `docs/PROJECT.md` from the code.
2. For a project with a UI: `follow .ai/prompts/frontend-setup.md` → it writes `docs/FRONTEND.md`.
3. Commit the new files.

Later: `follow .ai/prompts/audit.md` before a release, `follow .ai/prompts/ui-task.md` to hand a screen to
another agent, and "update the docs" whenever the code moved on.

## Customising

- **Project-specific rules:** write them under `## Project notes` in `AGENTS.md`.
- **Your own version of a prompt:** delete its first line (`<!-- ai-kit:managed … -->`); `update` will leave
  it alone from then on.
- **Personal rules for every project** (language, tone): put them in your agent's global file instead
  (`~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md`).
- **Your own kit:** fork this repo, edit `templates/`, and use `npx github:<you>/ai-kit init`.

---

## Ringkas (Bahasa Melayu)

Buka terminal dalam folder projek, kemudian:

```bash
npx github:Hazman97/ai-kit init      # pasang (fail sedia ada tak ditindih)
npx github:Hazman97/ai-kit doctor    # semak: docs hilang, placeholder, .env dalam git
npx github:Hazman97/ai-kit update    # tarik peraturan terbaru (nota projek tak disentuh)
```

Lepas `init`, beritahu AI: **"follow .ai/prompts/project-setup.md"**. Dia akan isi `docs/PROJECT.md` dari kod.
Untuk projek lama yang dah ada `AGENTS.md`, guna `init --merge`. Backup disimpan sebagai `*.ai-kit-backup`.

## Develop

```bash
npm test                      # node:test, no dependencies
node bin/ai-kit.js init --dir ../some-project --dry-run
```

MIT licence.
