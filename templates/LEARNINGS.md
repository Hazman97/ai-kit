# LEARNINGS.md

> Mistakes and fixes that happened in this project. Agents read this file at the start of every session
> (AGENTS.md R20). New entries are added only after the user agrees (R21). Past ~30 entries, entries that are
> `enforced` / `obsolete` / no longer relevant move to `LEARNINGS_ARCHIVE.md` (R22).

---

## Archive index

<!--
Empty until the first archive. Do not duplicate active entries here; list only entries moved to the archive.
Format: - [YYYY-MM-DD] [area] [severity] — Summary (→ LEARNINGS_ARCHIVE.md)
-->

---

## How to write an entry

<!--
FIELDS
- Date: from the `date` command. Never guess the date.
- Area: the module/layer (e.g. db, api, frontend, auth, infra, payment, notification). Reuse names already used below.
- Severity = the impact if the SAME mistake happens again:
    high   = data loss, security hole, downtime, or users cannot finish the main task
    medium = a bug users see / noticeable rework, but there is a workaround
    low    = developer friction, style, or a small mistake that is caught quickly
- Status:
    active   = still has to be remembered by hand
    enforced = now caught automatically (lint/test/type): archive candidate
    obsolete = that code/area is gone: archive candidate

TEMPLATE (copy the block below, without the fences):

```
## [YYYY-MM-DD] [area] [high|medium|low] — Short summary
❌ **Mistake:** what happened / the wrong assumption
🔍 **Root cause:** why it happened (not just the symptom)
✅ **Fix:** the right solution
📌 **Avoid next time:** a specific rule or pattern; if possible, the automatic check to add
🔗 **Ref:** related files / commit / PR
**Status:** active
```
-->

---

## Entries

<!-- Newest first. -->
