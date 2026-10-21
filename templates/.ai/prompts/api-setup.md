<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: create docs/API.md

Use when the user says "setup the API docs", "create API.md", or when a backend has more endpoints than
`docs/PROJECT.md` can list. `docs/API.md` is what lets a frontend change or another agent call the server
without guessing a route or a payload. Write it from this project's real code; do not change any code.

## 0. If `docs/API.md` (or another API doc in the Docs Index) already exists
Rearrange it into the sections below; do not write it from scratch (the same rule as `docs-update.md`).
- Keep every fact that is still true. Check each one against the code (R6); fix or mark what is wrong.
- Never drop a gotcha (a rate limit, an odd status code, a field the client must send): nobody can rebuild it
  from the code alone.
- In your report, list what you moved, what you corrected, and anything you removed and why.

## 1. Read first
- The server entry point and where routes are registered (router files, `app.get(…)`, decorators,
  `routes/*.php`, `urls.py`, a Worker's `fetch` handler…).
- Middleware: auth, CORS, rate limits, body parsing, error handler.
- Request/response validation (zod, pydantic, Form Requests, DTOs…) and shared types the client imports.
- The platform config: `wrangler.*`, `firebase.json`, Dockerfile, serverless config.
- Detected by ai-kit: {{BACKEND_DETECTED}}

## 2. Write `docs/API.md` with these sections (short, concrete, with real names)

```markdown
# API

## Overview
Base URL per environment (local, preview, production — names only if a URL is a secret), framework and
version, where routes live (file paths), the response shape for success and for errors.

## Auth
How a caller proves who it is (cookie, bearer token, API key header, Firebase ID token…), which routes are
public, and how roles/permissions are checked. Name the env variables; never write their values.

## Endpoints
One table per area (users, orders…):
| Method | Path | Auth | Body / query | Returns | Notes |
Real paths and field names from the code. Mark admin-only and destructive routes.

## Events and background work (if any)
Webhooks received or sent, queues, cron triggers, WebSocket messages: name, payload, who sends it.

## Errors and limits
Status codes the API really returns and what they mean here; rate limits; payload size limits; timeouts.

## Check before handing back
How to run the server locally, the test command for the API, and one example request (curl or the
project's HTTP client) a reader can run.
```

## 3. Rules for writing it
- Only facts you saw in the code; mark anything unsure with `⚠️ Unconfirmed`.
- List every route you find; if there are too many for one table, group them and say how you grouped them.
- Never write secrets, tokens or real user data in examples: use obvious placeholders.
- In a repo with several packages, write the server package's paths and commands (e.g. `cd worker && npm run dev`).
- Add `docs/API.md` to the Docs Index in `AGENTS.md` ("Open when: endpoints, events, payloads, API auth").
- Report what you wrote, routes that look unprotected or unused, and mismatches between client and server
  (do not fix them).
