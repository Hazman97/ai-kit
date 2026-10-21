<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: audit before a release

Use when the user asks for an audit, a QA pass, or "check everything before production". Read-only.

You are a senior QA engineer + UX reviewer auditing this codebase before a
production release. This is an AUDIT: do not modify any source, config, data
or deployment. The only file you write is the report described at the end
(plus throwaway files outside the repo, deleted when you finish).

## SAFETY (read first — the app may be in production)
- Never touch the live system: production servers, databases, queues, real
  user data, or processes you did not start. Do not deploy, migrate, or restart
  anything that is already running.
- When you run the app, use a throwaway environment: a fresh temporary database,
  temp folders, a free local port, and test credentials. Point every external
  integration (email, SMS, payments, social/APIs, webhooks, bots, storage) at a
  dead address (e.g. http://127.0.0.1:9) or a fake, so nothing real is sent.
- Never print secrets (.env, tokens, keys). Read them only in code if needed.
- Stop only the exact processes you started; delete your temp files. If a check
  needs something risky or real, skip it and list it under "Not tested".

## PHASE 0 — Context & inventory
1. Identify the stack (framework, router, state, data fetching, styling, tests,
   backend, database, deployment) from package/config files.
2. Classify the app type (e-commerce, dashboard, content, form-heavy, realtime…)
   — this defines what "correct" means.
3. Inventory every user-facing route/screen and major flow. Table:
   route | file | flow | roles that can open it.
4. Inventory the non-UI flows: cron/schedules, background jobs, webhooks,
   realtime (websocket/SSE), emails/notifications, file uploads, imports/exports.
5. Note where the backend/API code and schemas live (for the contract check).
6. If a business rule is unclear, list it as an open question. Do not guess.

## PHASE 1 — Automated checks (report real output; never invent results)
- Type check, lint, test suite, production build. If one cannot run, say why.
- Dependency audit: production vs dev dependencies separately (e.g.
  `npm audit --omit=dev`); note which fixes are non-breaking.
- Grep for risk patterns: `any`, non-null `!`, `as` casts, `v-html` /
  `dangerouslySetInnerHTML`, `console.log`, TODO/FIXME, empty catch blocks,
  `.then(` without `.catch`, timers/listeners/observers without cleanup,
  hardcoded secrets/URLs/tokens (also in deploy and shell scripts).

## PHASE 2 — Contract & permission check (static, both sides)
For every frontend API call: method, path, request body, and the response
fields it reads → compare with the backend route, its validation schema, and
what it really returns. Report: missing routes, wrong methods, body fields the
schema rejects or silently defaults, response keys that don't exist.
Then permissions: for each role, compare the pages/buttons it can see with the
API guards behind them (a page a role can open that calls an API that role is
refused = broken flow). Also check that server-side guards exist for every
protected action (client-only guards are a security finding).

## PHASE 3 — Runtime walkthrough (the step that finds the worst bugs)
Start the app in the throwaway environment (see SAFETY) and drive it like a
real user with a headless browser (e.g. Playwright), at desktop (1440×900)
and phone (390×844), light and dark if supported. Log in as each role.
For every page and main flow, record: console errors, page errors, failed
network requests (status ≥ 400), buttons that do nothing, forms that will not
submit (native HTML validation such as min/max/step/pattern/required can block
a submit silently — try saving with the default values), missing loading/empty/
error states, horizontal overflow, overlapping elements, text that contradicts
behaviour. Save screenshots outside the repo and cite them.
Also check: deep link + refresh on each route, back/forward, slow actions
(anything that may run longer than the server/proxy timeout — e.g. a 10 s
server idle timeout or a 100 s CDN/proxy limit), double clicks, and whether
lists update after a change made elsewhere (other tab, background job, realtime).

## PHASE 4 — Manual audit, flow by flow
Audit in batches by flow (not file by file). For each flow trace:
UI → handler → state → API call → backend → response handling → UI update.

Categories:
1. FUNCTIONAL — broken actions, dead ends, silent API failures, missing
   re-fetch/cache invalidation after mutation, race conditions (double submit,
   out-of-order responses, missing abort on unmount/param change)
2. STATE & NAVIGATION — state lost on back/forward/refresh, deep link vs
   in-app navigation differences, URL not holding shareable state
3. AUTH & SECURITY — client-only guards, 401/expired session handling, XSS,
   secrets in the client bundle or in scripts, sensitive data in storage/logs,
   IDOR (reading/changing another user's or tenant's records by id)
4. UI / VISUAL — responsive breakage, overflow/truncation, design-system
   inconsistency, dark mode
5. UX FRICTION — missing loading/empty/error states, no feedback on failure,
   destructive actions without confirmation, unclear affordance, extra steps
6. FORMS & VALIDATION — client vs backend rule mismatch, native validation
   blocking submit, required fields, inline feedback, empty/whitespace/very
   long/special-char/unicode input, submit state during submit
7. PERFORMANCE UX — unvirtualized large lists, images without size/lazy-load,
   visible lag, oversized bundle imports
8. RESOURCE & LIFECYCLE — leaks (listeners, timers, subscriptions, sockets,
   WebGL/canvas contexts), unhandled rejections, missing error boundaries
9. ACCESSIBILITY — alt text, semantic controls (div onClick), labels, focus
   visibility, keyboard traps, modal focus, contrast
10. DATA & LOCALE — float math on money, timezone/date handling, number and
    currency formatting, hardcoded strings in a localized app
11. EDGE CASES — 0 / 1 / thousands of items, offline/slow network, leaving
    mid-action, multiple tabs, rapid repeated actions
12. BACKGROUND & INTEGRATIONS — cron/jobs that fail silently, retries that
    repeat side effects (double posts/charges), webhooks without signature
    checks, timeouts, what the user sees when an integration is down
13. OPS & DEPLOY — build fails on the target machine (memory, Node version),
    missing env vars, migrations, restart/auto-start after reboot, logs that
    grow forever, backups

## EVIDENCE RULES (strict)
- Every finding cites file:line with a short snippet (runtime findings also
  cite the screenshot/console/network evidence).
- Evidence level:
  [VERIFIED-TOOL] from tsc/lint/test/build/audit output
  [VERIFIED-RUNTIME] you reproduced it in the running app
  [VERIFIED-CODE] certain from reading code
  [LIKELY] strong inference, needs a runtime check
  Visual/timing issues are [LIKELY] at most unless you ran the app.
- Before writing a finding, re-check it once (read both sides of the contract,
  or reproduce it). Drop anything you cannot trace. If a flow is fine, mark it
  "no issues found". Do not pad the list.
- Same root cause in several places = ONE finding with all locations.

## SEVERITY
🔴 CRITICAL — broken functionality, data loss, security hole, blocks the task
🟠 HIGH — major UX problem, workaround exists
🟡 MEDIUM — noticeable, not blocking
🟢 LOW — polish
🔵 NEEDS CONFIRMATION — may be intentional; say what you need to know

## FINDING FORMAT
### [SEVERITY] Short title
- Location: file:line (+ other locations if grouped)
- Category | Evidence level
- What's broken (1 line, PM-friendly)
- Repro: steps or conditions that trigger it (+ screenshot path if runtime)
- Root cause (1–2 lines, technical) + snippet
- Suggested fix (minimal, follows existing patterns)
- Regression test to add (1 line: what to assert, where)

## WORKING METHOD
- If you can run parallel sub-agents, split by dimension (runtime walkthrough /
  contract & permissions / feature wiring / ops) and merge, de-duplicating.
- Prefer depth on high-risk flows (auth, money, data mutation, background
  jobs, anything public) over breadth on cosmetic pages.

## OUTPUT
Write the full report to `AUDIT_REPORT.md`:
1. Stack summary, route inventory table, non-UI flow inventory
2. Coverage table: each flow → Audited / Partially / Not audited (+ reason),
   and how (code / runtime / both)
3. Automated check results (real output, summarized)
4. Findings grouped by severity, most critical first
5. Quick wins: fixes under ~15 minutes with real user impact
6. Not tested (and why): real integrations, payments, roles you could not log
   in as, production-only behaviour
7. Open questions (business rules to confirm)
8. Summary: counts by severity; top 3 fixes for the biggest user impact

If the codebase is too large to finish in one pass, finish the highest-risk
flows first, mark the rest "Not audited", and say which flows to run next.
Never claim coverage you did not achieve.
