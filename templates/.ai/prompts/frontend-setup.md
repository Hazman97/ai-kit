# Prompt: create docs/FRONTEND.md

Use when the user says "setup frontend rules", "create FRONTEND.md", or before the first UI task for
another agent. `docs/FRONTEND.md` is what keeps every screen consistent and phone-proof, whichever AI edits
it. Write it from this project's real code; do not change any code.

## 1. Read first
- The styling setup: global CSS, CSS variables / theme tokens, the Tailwind config or `@theme` block,
  the component library (if any), the icon set, dark mode handling.
- Five or six existing screens and the shared components (buttons, cards, inputs, modals).
- How the UI gets data: API client file, store/state library, how errors and loading are shown.
- Detected by ai-kit: {{FRONTEND_DETECTED}}

## 2. Write `docs/FRONTEND.md` with these sections (short, concrete, with real names)

```markdown
# Frontend rules

## Stack
Framework + version, router, state, styling (Tailwind version!), component/icon libraries, where the
design system lives (file paths).

## Design system — use these, never invent new ones
- Colours / tokens (names as written in code, light + dark).
- Shared classes or components (button, card, input, chip…) and when to use which.
- Spacing, radius, typography scale if the project defines one.

## Styling rules
{{STYLING_RULES}}

## Layout (phone first)
- At 390 px wide: no sideways page scroll; tap targets ≥ 40 px.
- How grids/rows stack on small screens in this project (with the real class names).
- Light and dark mode both readable (if the app has both).

## Data and logic
- UI state comes from: (store / API client file). Components do not call fetch directly unless the
  project already does.
- Loading, empty and error states: how existing screens show them.

## Safety
- User content, AI output, file names, web content: render as text, never as raw HTML
  (`v-html` / `dangerouslySetInnerHTML`) unless sanitized by an existing helper (name it).
- `localStorage` access inside `try/catch` (private windows throw).

## Check before handing back
The project's real commands: typecheck, lint, tests, build, and how to run the app to take
screenshots at desktop and 390 px.
```

## 3. Rules for writing it
- Only facts you saw in the code; mark anything unsure with `⚠️ Unconfirmed`.
- Keep it under ~80 lines: it is read before every UI task.
- Add `docs/FRONTEND.md` to the Docs Index in `AGENTS.md` ("Open when: any UI, component or styling task").
- Report what you wrote and anything inconsistent you noticed in the existing UI (do not fix it).
