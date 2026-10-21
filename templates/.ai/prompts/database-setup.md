<!-- ai-kit:managed — `ai-kit update` refreshes this file. Delete this line to keep your own edits. -->
# Prompt: create docs/DATABASE.md

Use when the user says "setup the database docs", "create DATABASE.md", or before a task that changes what
the app stores. `docs/DATABASE.md` is what keeps a schema change from breaking data nobody remembered.
Write it from this project's real code; do not change any code and do not run anything against a database.

## 0. If `docs/DATABASE.md` (or another data doc in the Docs Index) already exists
Rearrange it into the sections below; do not write it from scratch (the same rule as `docs-update.md`).
- Keep every fact that is still true. Check each one against the schema and migrations (R6); fix or mark
  what is wrong.
- Never drop a gotcha (a column that must stay nullable, an index a query depends on, a manual data fix).
- In your report, list what you moved, what you corrected, and anything you removed and why.

## 1. Read first
- The schema source: `schema.prisma`, Drizzle/TypeORM/Sequelize models, `database/migrations/` and Eloquent
  models, Django `models.py`, SQL files, Mongoose schemas.
- Migrations: the folder, the tool, and how they are applied (script, CI, on deploy).
- Storage that is not a SQL table: Cloudflare D1/KV/R2/Durable Objects bindings in `wrangler.*`,
  Firestore collections and `firestore.rules`, Supabase policies, Redis keys, uploaded files.
- Seed and fixture data, backups, and where each environment's database lives.
- Detected by ai-kit: {{DATA_DETECTED}}

## 2. Write `docs/DATABASE.md` with these sections (short, concrete, with real names)

```markdown
# Database

## Overview
Engine(s) and version, ORM/query layer, where the schema lives (file paths), one database per environment
and how each is reached (env variable names only, never values).

## Schema
One short block per table/collection: purpose, key columns/fields with types, primary key, relations,
unique constraints and important indexes. Mark columns holding personal or sensitive data.

## Other storage
KV namespaces, buckets, caches, queues: what is stored under which key or path, and for how long.

## Access rules
Row-level security, Firestore/Supabase rules, or where the app checks ownership before reading or
writing. Say plainly if there are none.

## Migrations
How to create one, how to apply it locally, how it reaches production. Applied migrations are never
edited (AGENTS.md R17): a fix is a new migration.

## Check before handing back
The local commands to reset, migrate and seed a development database. Never a command against production.
```

## 3. Rules for writing it
- Only facts you saw in the code; mark anything unsure with `⚠️ Unconfirmed`.
- Do not connect to any database to "check": read the schema and migrations. If the only source of truth is
  a live database, say so and ask the user for an exported schema.
- Never write connection strings, passwords or real rows.
- Add `docs/DATABASE.md` to the Docs Index in `AGENTS.md` ("Open when: schema, queries, migrations, anything stored").
- Report what you wrote, and anything risky you noticed (missing indexes on queried columns, no access rules,
  sensitive data stored in plain text) without fixing it.
