import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { VERSION, doctor, init, projectPart, update } from "../lib/commands.js";
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

test("init on a new project: every file, placeholders filled, an index of what exists", () => {
  const dir = project(VUE);
  const { plan } = init(dir);
  for (const f of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "LEARNINGS.md", "docs/PROJECT.md", ".ai/prompts/audit.md", ".ai/prompts/docs-update.md", ".ai/prompts/frontend-setup.md", ".ai/prompts/project-setup.md", ".ai/prompts/ui-task.md", ".ai/ai-kit.json"]) {
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

test("an existing AGENTS.md is kept unless --merge; --merge keeps the project's own sections and a backup", () => {
  const dir = project({ "AGENTS.md": OLD_AGENTS, "CLAUDE.md": "Use Opus.\n" });
  const plain = init(dir);
  assert.equal(kinds(plain.plan)["AGENTS.md"], "keep");
  assert.equal(read(dir, "AGENTS.md"), OLD_AGENTS);
  assert.equal(kinds(plain.plan)["CLAUDE.md"], "keep");

  const merged = init(dir, { merge: true });
  assert.equal(kinds(merged.plan)["AGENTS.md.ai-kit-backup"], "backup");
  assert.equal(read(dir, "AGENTS.md.ai-kit-backup"), OLD_AGENTS);
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

test("doctor: placeholders, missing docs, old names, stale index (--fix), committed .env", () => {
  const dir = project({ "AGENTS.md": OLD_AGENTS.replace("## Deploy notes", "See `docs/ARCHITECTURE.md`.\n\n## Deploy notes"), "docs/API_REFERENCE.md": "# API\n" });
  const msgs = doctor(dir).findings.map((f) => `${f.level}: ${f.message}`).join("\n");
  assert.match(msgs, /warn: AGENTS\.md has no ai-kit rules block/);
  assert.match(msgs, /placeholders: <NAMA_FAIL_DATABASE>/);
  assert.match(msgs, /refers to `docs\/ARCHITECTURE\.md`, which does not exist/);
  assert.match(msgs, /`docs\/API_REFERENCE\.md` uses an older name; the standard is docs\/API\.md/);
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
