<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: write a UI task for another agent

How to split UI work so it comes out clean, including on phones (AGENTS.md R14–R15):
1. **Logic first.** The API, data, state and pure helpers are built and tested, working but plain.
2. **The other agent does the look only**, in a fixed list of files, keeping every piece of logic.
3. **It proves the result**: typecheck, tests, build, and real screenshots (desktop + 390 px, light + dark).
4. **The first agent reviews** the diff, runs the tests and looks at the screenshots; anything off goes back.

Copy everything below the line into `tasks/NNN-short-name.md` (or wherever this project keeps tasks), fill in
the brackets, and give the other agent the short prompt at the bottom.

---

# Task NNN: [what the user will see, in a few words]

[One or two sentences: who uses it and why. The logic is done and tested; this task is the look.]

## Scope: edit ONLY
- `[path/to/Screen]`: [which part: the list, the form, the card…]
- `[path/to/Component]`: [which part]

**Keep exactly as they are:**
- every API call and its arguments;
- props, events/emits, bindings (`v-model` / value+onChange), computed values and watchers/effects;
- [any special logic: e.g. "the polling timer", "the custom option of the picker"].

## What to build
1. [Element]: [what it shows, in what order, what happens on tap].
2. [Element]: [states: loading / empty / error / success; what each looks like].
3. **Phone (390 px):** no sideways scroll; tap targets ≥ 40 px; [what stacks or collapses].
4. **Light and dark** both readable (if the app has both).

## Rules
- Follow `docs/FRONTEND.md` (design tokens only, the project's styling rules).
- Do not edit: [logic files, API client, stores, backend, shared helpers].
- No new packages. Never delete or move files. Do not commit.
- Screenshots and browser profiles go in `.ai/tmp/` (git-ignored); delete the profile when done.

## Check before you hand back
- {{CHECK_COMMANDS}}
- Screenshots of [pages] at desktop and 390 px, light and dark (run the app: {{DEV_COMMAND}}).
- Tell the user you are done; the reviewing agent checks the diff and the screenshots.

---

**Prompt for the other agent:**

```
Read tasks/NNN-short-name.md and do the whole task.
Edit only the files it lists; keep every API call, prop, event and binding as they are.
Follow docs/FRONTEND.md. Before handing back: typecheck, tests, build, and screenshots
(desktop + 390 px, light + dark) of the pages it names, saved in .ai/tmp/.
Do not commit. Tell me when you are done.
```
