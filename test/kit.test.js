import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { VERSION, doctor, init, nextSteps, projectPart, update } from "../lib/commands.js";
import { detect } from "../lib/detect.js";

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A temp project with the given files ({ path: content }). */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ai-kit-"));
  dirs.push(dir);
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), typeof c === "string" ? c : JSON.stringify(c));
  }
  return dir;
}
const read = (dir, p) => readFileSync(join(dir, p), "utf8");
const kinds = (plan) => Object.fromEntries(plan.actions.map((a) => [a.path, a.kind]));

const VUE = {
  "package.json": { name: "shop", scripts: { dev: "vite", build: "vite build", test: "vitest run", typecheck: "vue-tsc" }, dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^7.0.0", tailwindcss: "^4.1.0", typescript: "^5.9.0", vitest: "^3.2.0" } },
  "bun.lock": "",
};

test("detect: framework, Tailwind version, package manager and commands", () => {
  const vue = detect(project(VUE));
  assert.equal(vue.framework, "Vue 3");
  assert.equal(vue.tailwind, 4);
  assert.equal(vue.commands.dev, "bun run dev");
  assert.equal(vue.commands.typecheck, "bun run typecheck");
  assert.equal(vue.commands.lint, null);

  const react = detect(project({ "package.json": { name: "app", scripts: { start: "react-scripts start" }, dependencies: { react: "^18.2.0", express: "^4.0.0" }, devDependencies: { tailwindcss: "^3.4.0" } }, "pnpm-lock.yaml": "" }));
  assert.equal(react.framework, "React 18");
  assert.equal(react.tailwind, 3);
  assert.equal(react.commands.dev, "pnpm start");
  assert.ok(react.stack.some((l) => l.includes("Backend: Express")));

  const py = detect(project({ "pyproject.toml": "[project]\nname='x'" }));
  assert.equal(py.hasPackage, false);
  assert.ok(py.stack.some((l) => l.includes("Python")));
});

test("detect: a frontend/ + backend/ repo whose root package.json only has scripts", () => {
  const f = detect(project({
    "package.json": { name: "notes", scripts: { dev: "x", test: "x" } },
    "frontend/package.json": { scripts: { dev: "vite", build: "vite build", lint: "oxlint" }, dependencies: { react: "^19.0.0" }, devDependencies: { vite: "^8.0.0", tailwindcss: "^4.1.0", typescript: "^5.9.0" } },
    "backend/package.json": { scripts: { dev: "wrangler dev", test: "vitest run" }, dependencies: { hono: "^4.0.0", "drizzle-orm": "^0.40.0" }, devDependencies: { wrangler: "^4.0.0" } },
    "frontend/node_modules/x/package.json": { dependencies: { vue: "^3.0.0" } },
    "frontend/dist/package.json": { dependencies: { svelte: "^5.0.0" } },
  }));
  assert.equal(f.framework, "React 19");
  assert.equal(f.tailwind, 4);
  assert.equal(f.frontendPath, "frontend");
  assert.deepEqual(f.packages.map((p) => `${p.path}=${p.role}`).sort(), [".=root", "backend=backend", "frontend=frontend"]);
  assert.ok(f.stack.some((l) => l.startsWith("- `backend/` (backend): Backend: Hono on Cloudflare Workers")), f.stack.join("\n"));
  assert.ok(f.stack.some((l) => /Layout: 2 packages .*only holds scripts/.test(l)));
  // the root's own scripts stay the project commands; UI tasks run inside frontend/
  assert.equal(f.commands.dev, "npm run dev");
  assert.equal(f.commands.build, "cd frontend && npm run build");
  assert.equal(f.uiCommands.dev, "cd frontend && npm run dev");
  assert.equal(f.uiCommands.lint, "cd frontend && npm run lint");
  assert.ok(f.commandRows.some(([t, c]) => t === "Tests (`backend/`)" && c === "cd backend && npm run test"));
});

test("detect: pnpm workspaces, other languages, full-stack and mobile apps, sub-package internals skipped", () => {
  const ws = detect(project({
    "package.json": { name: "mono", workspaces: ["apps/*", "packages/*"] },
    "pnpm-lock.yaml": "",
    "apps/web/package.json": { scripts: { dev: "next dev" }, dependencies: { next: "^15.0.0", react: "^19.0.0" } },
    "apps/mobile/package.json": { dependencies: { expo: "^52.0.0", "react-native": "^0.76.0" } },
    "apps/api/pyproject.toml": '[project]\ndependencies = ["fastapi>=0.110"]\n',
    "packages/ui/package.json": { dependencies: { react: "^19.0.0" } },
    "packages/ui/src/inner/package.json": { dependencies: { vue: "^3.0.0" } },
  }));
  const roles = Object.fromEntries(ws.packages.map((p) => [p.path, p.role]));
  assert.equal(roles["apps/web"], "fullstack");
  assert.equal(roles["apps/mobile"], "mobile");
  assert.equal(roles["apps/api"], "backend");
  assert.equal(roles["packages/ui"], "frontend");
  assert.equal(roles["packages/ui/src/inner"], undefined, "a package's own source folders are not scanned");
  assert.ok(ws.stack.some((l) => l.includes("`apps/api/` (backend): Python (FastAPI)")));
  assert.ok(ws.stack.some((l) => l.includes("workspaces in package.json")));
  assert.equal(ws.uiCommands.dev, "cd apps/web && pnpm dev");

  const go = detect(project({ "server/go.mod": "module x\nrequire github.com/gin-gonic/gin v1.10.0\n", "app/pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n" }));
  const r = Object.fromEntries(go.packages.map((p) => [p.path, p.role]));
  assert.deepEqual(r, { app: "mobile", server: "backend" });
  assert.equal(go.hasPackage, false);
});

test("detect: Tailwind from a CDN script, sub-package check/deploy scripts, wrangler storage bindings", () => {
  const dir = project({
    "package.json": { name: "smash", scripts: { dev: "vite" }, dependencies: { react: "^19.0.0" }, devDependencies: { vite: "^7.0.0" } },
    "index.html": '<head><script src="https://cdn.tailwindcss.com"></script></head>',
    "worker/package.json": { scripts: { dev: "wrangler dev", check: "tsc --noEmit", deploy: "wrangler deploy" }, devDependencies: { wrangler: "^4.0.0" } },
    "worker/wrangler.toml": 'name = "api"\n[[d1_databases]]\nbinding = "DB"\n',
  });
  const f = detect(dir);
  assert.equal(f.styling, "Tailwind CSS v3 (CDN)");
  assert.equal(f.tailwind, 3);
  assert.equal(f.commands.typecheck, "cd worker && npm run check");
  assert.ok(f.commandRows.some(([t, c]) => t === "Deploy (`worker/`)" && c === "cd worker && npm run deploy"), JSON.stringify(f.commandRows));
  assert.ok(f.stack.some((l) => l.includes("Data: Cloudflare D1")), f.stack.join("\n"));
  // `check` that is not a type checker stays out of the type-check row
  assert.equal(detect(project({ "package.json": { scripts: { check: "npm run lint && npm test" } } })).commands.typecheck, null);
  // v4 browser build
  assert.equal(detect(project({ "package.json": { dependencies: { vue: "^3.5.0" } }, "index.html": '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>' })).styling, "Tailwind CSS v4 (CDN)");

  init(dir);
  assert.match(read(dir, ".ai/prompts/api-setup.md"), /Detected by ai-kit: Cloudflare Workers in `worker\/`/);
  assert.match(read(dir, ".ai/prompts/database-setup.md"), /Detected by ai-kit: Cloudflare D1 in `worker\/`/);
  assert.match(read(dir, "AGENTS.md"), /\| `api-setup\.md` \|/);
});

test("detect: Laravel commands through artisan, Blade CDN Tailwind, Eloquent migrations", () => {
  const dir = project({
    "composer.json": { require: { "laravel/framework": "^11.0" }, scripts: { dev: ["npx concurrently ..."] } },
    "package.json": { scripts: { dev: "vite", build: "vite build" }, devDependencies: { vite: "^6.0.0" } },
    "resources/views/layouts/app.blade.php": '<script src="https://cdn.tailwindcss.com"></script>',
    "database/migrations/2024_01_01_000000_create_users_table.php": "<?php",
  });
  const f = detect(dir);
  // Blade pages make it a UI too: the frontend prompt is offered and the top-level styling is filled
  assert.equal(f.packages[0].role, "fullstack");
  assert.equal(f.framework, "Blade (Laravel)");
  assert.equal(f.styling, "Tailwind CSS v3 (CDN)");
  assert.equal(f.commands.dev, "composer run dev");
  assert.equal(f.commands.test, "php artisan test");
  assert.equal(f.commands.build, "npm run build");
  assert.equal(f.packages[0].styling, "Tailwind CSS v3 (CDN)");
  assert.ok(f.stack.some((l) => l.includes("Eloquent (database/migrations)")), f.stack.join("\n"));
  init(dir);
  assert.match(read(dir, ".ai/prompts/api-setup.md"), /Detected by ai-kit: PHP \(Laravel\) in root/);
  // Inertia + Vue: the JS framework names the UI, the app is still full-stack
  const inertia = detect(project({ "composer.json": { require: { "laravel/framework": "^11.0" } }, "package.json": { dependencies: { vue: "^3.5.0" } } }));
  assert.equal(inertia.packages[0].role, "fullstack");
  assert.equal(inertia.framework, "Vue 3");
});

test("init on a new project: every file, placeholders filled, an index of what exists", () => {
  const dir = project(VUE);
  const { plan } = init(dir);
  for (const f of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "LEARNINGS.md", "docs/PROJECT.md", ".ai/prompts/audit.md", ".ai/prompts/docs-update.md", ".ai/prompts/frontend-setup.md", ".ai/prompts/api-setup.md", ".ai/prompts/database-setup.md", ".ai/prompts/project-setup.md", ".ai/prompts/ui-task.md", ".ai/ai-kit.json"]) {
    assert.equal(kinds(plan)[f], "create", f);
    assert.doesNotMatch(read(dir, f), /\{\{[A-Z_]+\}\}/, `${f} has an unfilled placeholder`);
  }
  const agents = read(dir, "AGENTS.md");
  assert.match(agents, new RegExp(`ai-kit:rules v${VERSION.replace(/\./g, "\\.")}`));
  assert.match(agents, /\| `docs\/PROJECT\.md` \|/);
  assert.match(agents, /\| `LEARNINGS\.md` \|/);
  assert.match(read(dir, "CLAUDE.md"), /^@AGENTS\.md/);
  assert.match(read(dir, "docs/PROJECT.md"), /\| Build \| `bun run build` \|/);
  assert.match(read(dir, ".ai/prompts/frontend-setup.md"), /Tailwind v4: the spacing scale is dynamic/);
  assert.match(read(dir, ".ai/prompts/ui-task.md"), /`bun run typecheck`, `bun run test`, `bun run build` pass\./);
  // a second run changes nothing (only the metadata date)
  const again = init(dir).plan.actions.filter((a) => a.kind !== "keep").map((a) => a.path);
  assert.deepEqual(again, [".ai/ai-kit.json"]);
});

test("dry run writes nothing", () => {
  const dir = project(VUE);
  init(dir, { dryRun: true });
  assert.equal(existsSync(join(dir, "AGENTS.md")), false);
  assert.equal(existsSync(join(dir, ".ai")), false);
});

const OLD_AGENTS = `# AGENTS.md

## Working Principles (general, bukan project-specific)

1. Old generic rule.

## Docs Index (baca on-demand, bukan semua sekaligus)

| \`docs/<NAMA_FAIL_DATABASE>.md\` | x |

## Deploy notes

Run \`./deploy.sh\` on the server.
`;

test("an existing AGENTS.md is converted by default (backup, latest rules, own sections kept); --no-merge leaves it", () => {
  const dir = project({ "AGENTS.md": OLD_AGENTS, "CLAUDE.md": "Use Opus.\n" });
  const plain = init(dir, { merge: false });
  assert.equal(kinds(plain.plan)["AGENTS.md"], "keep");
  assert.equal(read(dir, "AGENTS.md"), OLD_AGENTS);
  assert.equal(kinds(plain.plan)["CLAUDE.md"], "keep");

  const merged = init(dir);
  assert.equal(kinds(merged.plan)[".ai/backup/AGENTS.md"], "backup");
  assert.equal(read(dir, ".ai/backup/AGENTS.md"), OLD_AGENTS);
  const agents = read(dir, "AGENTS.md");
  assert.match(agents, /<!-- ai-kit:rules v/);
  assert.match(agents, /### Deploy notes\n\nRun `\.\/deploy\.sh`/);
  assert.doesNotMatch(agents, /Old generic rule/);
  assert.doesNotMatch(agents, /NAMA_FAIL_DATABASE/);
  assert.match(read(dir, "CLAUDE.md"), /^@AGENTS\.md\n\nUse Opus\./);
  assert.deepEqual(projectPart(OLD_AGENTS).dropped, ["Working Principles", "Docs Index"]);
});

test("update refreshes the rules and managed prompts, never the project's notes or the user's own prompts", () => {
  const dir = project(VUE);
  init(dir);
  const notes = "\n## My project\nKeep port 8080.\n";
  const old = read(dir, "AGENTS.md").replace(/ai-kit:rules v[\d.]+/, "ai-kit:rules v0.9.0").replace("**R1.** Reply", "**R1.** OLD reply");
  writeFileSync(join(dir, "AGENTS.md"), old + notes);
  writeFileSync(join(dir, ".ai/prompts/audit.md"), `<!-- ai-kit:managed -->\nold audit\n`);
  writeFileSync(join(dir, ".ai/prompts/docs-update.md"), "my own docs prompt\n");
  writeFileSync(join(dir, "docs/API.md"), "# API\n");

  const { plan } = update(dir);
  const agents = read(dir, "AGENTS.md");
  assert.match(agents, new RegExp(`ai-kit:rules v${VERSION.replace(/\./g, "\\.")}`));
  assert.match(agents, /\*\*R1\.\*\* Reply/);
  assert.ok(agents.endsWith(notes), "project notes kept");
  assert.match(agents, /\| `docs\/API\.md` \|/);
  assert.equal(kinds(plan)[".ai/prompts/audit.md"], "update");
  assert.equal(kinds(plan)[".ai/prompts/docs-update.md"], "keep");
  assert.equal(read(dir, ".ai/prompts/docs-update.md"), "my own docs prompt\n");
  assert.ok(update(project()).failed, "update needs init first");
});

test("doctor: placeholders, missing docs, own doc names left alone, stale index (--fix), committed .env", () => {
  const dir = project({ "AGENTS.md": OLD_AGENTS.replace("## Deploy notes", "See `docs/ARCHITECTURE.md`.\n\n## Deploy notes"), "docs/API_REFERENCE.md": "# API\n" });
  const msgs = doctor(dir).findings.map((f) => `${f.level}: ${f.message}`).join("\n");
  assert.match(msgs, /warn: AGENTS\.md has no ai-kit rules block/);
  assert.match(msgs, /placeholders: <NAMA_FAIL_DATABASE>/);
  assert.match(msgs, /refers to `docs\/ARCHITECTURE\.md`, which does not exist/);
  assert.doesNotMatch(msgs, /API_REFERENCE/, "a project's own doc name is not a finding (R23)");
  assert.match(msgs, /No CLAUDE\.md/);

  const fresh = project(VUE);
  init(fresh);
  assert.equal(doctor(fresh).findings.filter((f) => f.level !== "info").length, 0, "a fresh init is clean");
  writeFileSync(join(fresh, "docs/OPS.md"), "# Ops\n");
  assert.match(doctor(fresh).findings.map((f) => f.message).join("\n"), /Docs Index .* does not match/);
  doctor(fresh, { fix: true });
  assert.match(read(fresh, "AGENTS.md"), /\| `docs\/OPS\.md` \| Deploy, environments/);
  assert.equal(doctor(fresh).findings.filter((f) => f.level !== "info").length, 0);

  if (spawnSync("git", ["--version"]).status === 0) {
    const g = project({ ".env": "KEY=1\n", ".env.example": "KEY=\n" });
    spawnSync("git", ["init", "-q"], { cwd: g });
    spawnSync("git", ["add", "-f", ".env", ".env.example"], { cwd: g });
    const env = doctor(g).findings.find((f) => f.level === "error" && /Secret files/.test(f.message));
    assert.ok(env, "committed .env is an error");
    assert.match(env.message, /\.env\b/);
    assert.doesNotMatch(env.message, /\.env\.example/);
  }
});

const HAND_AGENTS = `# AGENTS.md

## Working Principles (general)

1. Old generic rule.

## Docs Index (read on demand)

Skim README.md once per session.

| Doc | Open when |
|---|---|
| \`docs/DB_NOTES.md\` | Task involves schema, queries or migrations |
| \`docs/GUIDE_*.md\` | Writing user-facing help |
| \`docs/<NAME>.md\` | placeholder row |

**Updating /docs?** Follow docs-generation.md.
`;

test("--merge keeps hand-written Docs Index texts and the prose around the table; update and doctor keep them too", () => {
  const dir = project({ ...VUE, "AGENTS.md": HAND_AGENTS, "docs/DB_NOTES.md": "# Database notes\n", "docs/GUIDE_USERS.md": "# Guide\n", "docs/MISC.md": "# Misc things\n" });
  init(dir, { merge: true });
  const agents = read(dir, "AGENTS.md");
  assert.match(agents, /\| `docs\/DB_NOTES\.md` \| Task involves schema, queries or migrations \|/);
  assert.match(agents, /\| `docs\/GUIDE_USERS\.md` \| Writing user-facing help \|/, "a `docs/GUIDE_*.md` pattern applies to the real file");
  assert.match(agents, /\| `docs\/MISC\.md` \| Tasks about Misc things \(edit this line/);
  assert.match(agents, /### Notes from the old Docs Index\n\nSkim README\.md once per session\.\n\n\*\*Updating \/docs\?\*\* Follow docs-generation\.md\./);
  assert.doesNotMatch(agents, /placeholder row/);

  // regenerating keeps them: update, doctor (no false "stale index"), doctor --fix after a new doc
  update(dir);
  assert.match(read(dir, "AGENTS.md"), /\| `docs\/DB_NOTES\.md` \| Task involves schema/);
  assert.equal(doctor(dir).findings.some((f) => /Docs Index/.test(f.message)), false);
  writeFileSync(join(dir, "docs/OPS.md"), "# Ops\n");
  doctor(dir, { fix: true });
  const fixed = read(dir, "AGENTS.md");
  assert.match(fixed, /\| `docs\/OPS\.md` \| Deploy, environments/);
  assert.match(fixed, /\| `docs\/DB_NOTES\.md` \| Task involves schema/);
});

test("update recovers Docs Index texts that ai-kit 1.0 dropped, from the old AGENTS.md.ai-kit-backup", () => {
  const dir = project({ ...VUE, "docs/DB_NOTES.md": "# Database notes\n" });
  init(dir);
  // what a 1.0 merge left behind: a generated row, and the original file as a root backup
  writeFileSync(join(dir, "AGENTS.md"), read(dir, "AGENTS.md").replace(/\| `docs\/DB_NOTES\.md` \| [^\n]*/, "| `docs/DB_NOTES.md` | Task touches: Database notes |"));
  writeFileSync(join(dir, "AGENTS.md.ai-kit-backup"), HAND_AGENTS);
  update(dir);
  assert.match(read(dir, "AGENTS.md"), /\| `docs\/DB_NOTES\.md` \| Task involves schema, queries or migrations \|/);
});

test(".gitignore: block added once, user lines and CRLF kept, refreshed in place", () => {
  const fresh = project(VUE);
  init(fresh);
  assert.match(read(fresh, ".gitignore"), /^# ai-kit: .*\n\.ai\/tmp\/\n\.ai\/backup\/\n\.chrome\*\/\n\.playwright-mcp\/\n# \/ai-kit\n$/);
  assert.equal(kinds(init(fresh).plan)[".gitignore"], "keep", "a second run leaves it alone");

  const crlf = project({ ...VUE, ".gitignore": "node_modules/\r\n.env" });
  init(crlf);
  const g = read(crlf, ".gitignore");
  assert.ok(g.startsWith("node_modules/\r\n.env\r\n\r\n# ai-kit:"), JSON.stringify(g.slice(0, 40)));
  assert.doesNotMatch(g.replace(/\r\n/g, ""), /\n/, "no bare LF mixed into a CRLF file");

  const old = project({ ...VUE, ".gitignore": "dist/\n# ai-kit: old\n.ai/tmp/\n# /ai-kit\nlogs/\n" });
  init(old);
  const o = read(old, ".gitignore");
  assert.match(o, /^dist\/\n# ai-kit: scratch[^\n]*\n\.ai\/tmp\/\n\.ai\/backup\/\n\.chrome\*\/\n\.playwright-mcp\/\n# \/ai-kit\nlogs\/\n$/);
  assert.equal((o.match(/# ai-kit:/g) ?? []).length, 1);
});

test("doctor: a browser profile left in the project is an error until it is git-ignored", { skip: spawnSync("git", ["--version"]).status !== 0 }, () => {
  const dir = project({ "package.json": { name: "x" }, ".chrome-admin-profile/Local State": "{}", ".chrome-admin-profile/Default/Network/Cookies": "x", "screenshots/before-home.png": "x", "src/app.js": "" });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const before = doctor(dir).findings;
  const err = before.find((f) => f.level === "error" && /Browser profile/.test(f.message));
  assert.ok(err, before.map((f) => f.message).join("\n"));
  assert.match(err.message, /\.chrome-admin-profile\//);
  assert.ok(before.some((f) => f.level === "warn" && /screenshots\//.test(f.message)));
  assert.ok(before.some((f) => /No ai-kit block in \.gitignore/.test(f.message)));

  init(dir); // adds .chrome*/ to .gitignore
  assert.equal(doctor(dir).findings.some((f) => /Browser profile/.test(f.message)), false);
});

test("init on a project that is already set up brings it to the latest version, like update", () => {
  const dir = project(VUE);
  init(dir);
  const notes = "\n## My project\nKeep port 8080.\n";
  writeFileSync(join(dir, "AGENTS.md"), read(dir, "AGENTS.md").replace(/ai-kit:rules v[\d.]+/, "ai-kit:rules v0.9.0").replace("**R1.** Reply", "**R1.** OLD reply") + notes);
  writeFileSync(join(dir, ".ai/prompts/audit.md"), "<!-- ai-kit:managed -->\nold audit\n");
  writeFileSync(join(dir, ".ai/prompts/ui-task.md"), "my own ui prompt\n");
  writeFileSync(join(dir, "LEARNINGS.md"), "# mine\n");
  const { plan } = init(dir);
  const agents = read(dir, "AGENTS.md");
  assert.match(agents, /\*\*R1\.\*\* Reply/);
  assert.match(agents, new RegExp(`ai-kit:rules v${VERSION.replace(/\./g, "\\.")}`));
  assert.ok(agents.endsWith(notes), "project notes kept");
  assert.equal(kinds(plan)[".ai/prompts/audit.md"], "update");
  assert.equal(read(dir, ".ai/prompts/ui-task.md"), "my own ui prompt\n");
  assert.equal(read(dir, "LEARNINGS.md"), "# mine\n");
  assert.equal(Object.keys(kinds(plan)).some((p) => p.startsWith(".ai/backup/")), false, "an ai-kit AGENTS.md needs no backup");
});

test("next steps: the one-time setup prompts are shown only until each doc is written", () => {
  const dir = project(VUE);
  const { facts } = init(dir);
  assert.deepEqual(nextSteps(dir, facts).map((s) => s.say), ["follow .ai/prompts/project-setup.md", "follow .ai/prompts/frontend-setup.md"]);

  writeFileSync(join(dir, "docs/PROJECT.md"), "# shop\n\n## What it is\nA shop.\n");
  assert.deepEqual(nextSteps(dir, facts).map((s) => s.say), ["follow .ai/prompts/frontend-setup.md"]);
  writeFileSync(join(dir, "docs/FRONTEND.md"), "# Frontend rules\n");
  assert.deepEqual(nextSteps(dir, facts), [], "a project that is set up gets nothing to say");

  const api = project({ "package.json": { name: "api", dependencies: { express: "^5.0.0" } } });
  const r = init(api);
  assert.deepEqual(nextSteps(api, r.facts).map((s) => s.say), ["follow .ai/prompts/project-setup.md"], "no UI, no frontend-setup");
});
