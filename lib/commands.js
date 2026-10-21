import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { detect, listDocs } from "./detect.js";
import { LEGACY_NAMES, docsIndex, fill, firstHeading, readBlock, replaceBlock, templateValues } from "./render.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const TEMPLATES = join(ROOT, "templates");

/** Every template file, as a project-relative path with forward slashes. */
function templateFiles() {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(TEMPLATES, p).split(sep).join("/"));
    }
  };
  walk(TEMPLATES);
  return out.sort((a, b) => (a === "AGENTS.md" ? 1 : b === "AGENTS.md" ? -1 : a.localeCompare(b))); // AGENTS.md last (its index lists the others)
}

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const IMPORTS_AGENTS = /^@(\.\/)?AGENTS\.md\s*$/m;
const MANAGED = "ai-kit:managed";

/** A plan of file changes; applied unless dry-run. */
class Plan {
  constructor(dir, dryRun) {
    this.dir = dir;
    this.dryRun = dryRun;
    this.actions = [];
    this.notes = [];
  }
  /** kind: create | update | keep | backup */
  record(kind, rel, note = "") {
    this.actions.push({ kind, path: rel, note });
  }
  write(rel, content, kind, note) {
    this.record(kind, rel, note);
    if (this.dryRun) return;
    const p = join(this.dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  backup(rel) {
    const to = `${rel}.ai-kit-backup`;
    this.record("backup", to, `copy of your ${rel}`);
    if (!this.dryRun) copyFileSync(join(this.dir, rel), join(this.dir, to));
  }
}

/** The docs the index should list once this run is done. */
function docsAfter(dir, plan) {
  const set = new Set(listDocs(dir));
  for (const a of plan.actions) if (a.kind === "create" && a.path.endsWith(".md") && (a.path.startsWith("docs/") || !a.path.includes("/"))) set.add(a.path);
  for (const f of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) set.delete(f);
  return [...set].sort();
}

function withIndex(text, dir, plan) {
  const index = docsIndex(docsAfter(dir, plan), (f) => firstHeading(join(dir, f)));
  return replaceBlock(text, "docs-index", index) ?? text;
}

// ---------------------------------------------------------------- init

export function init(dir, { dryRun = false, merge = false } = {}) {
  const facts = detect(dir);
  const values = templateValues(facts, VERSION);
  const plan = new Plan(dir, dryRun);

  for (const rel of templateFiles()) {
    const fresh = fill(read(join(TEMPLATES, rel)), values);
    const target = join(dir, rel);
    if (!existsSync(target)) {
      plan.write(rel, rel === "AGENTS.md" ? withIndex(fresh, dir, plan) : fresh, "create");
      continue;
    }
    const current = read(target);
    if (rel === "AGENTS.md") {
      if (readBlock(current, "rules")) {
        plan.record("keep", rel, "already set up: use `ai-kit update` for newer rules");
      } else if (merge) {
        plan.backup(rel);
        const { kept, dropped } = projectPart(current);
        const merged = kept
          ? `${withIndex(fresh, dir, plan).trimEnd()}\n\n### From the previous AGENTS.md (kept by \`ai-kit init --merge\`)\n<!-- Remove anything the rules above already cover; keep only this project's own notes. -->\n\n${kept}\n`
          : withIndex(fresh, dir, plan);
        const note = dropped.length ? `new rules; the old template's ${dropped.map((d) => `"${d}"`).join(" and ")} replaced${kept ? ", your other sections kept under Project notes" : ""}` : "new rules on top, your old file kept under Project notes";
        plan.write(rel, merged, "update", note);
      } else {
        plan.record("keep", rel, "exists without ai-kit blocks: run `ai-kit init --merge` to add them (your text is kept)");
        plan.notes.push("AGENTS.md was not changed. `ai-kit init --merge` adds the rules and keeps your file below them.");
      }
      continue;
    }
    if (rel === "CLAUDE.md" || rel === "GEMINI.md") {
      if (IMPORTS_AGENTS.test(current)) plan.record("keep", rel, "already imports AGENTS.md");
      else if (merge) {
        plan.backup(rel);
        plan.write(rel, `${fresh.split("\n")[0]}\n\n${current}`, "update", "now imports AGENTS.md first");
      } else plan.record("keep", rel, "exists; `--merge` adds the AGENTS.md import line");
      continue;
    }
    plan.record("keep", rel, "exists, never overwritten");
  }

  const meta = { version: VERSION, detected: { name: facts.name, framework: facts.framework, styling: facts.styling }, updated: new Date().toISOString().slice(0, 10) };
  plan.write(".ai/ai-kit.json", `${JSON.stringify(meta, null, 2)}\n`, existsSync(join(dir, ".ai/ai-kit.json")) ? "update" : "create");
  return { plan, facts };
}

// ---------------------------------------------------------------- update

export function update(dir, { dryRun = false } = {}) {
  const facts = detect(dir);
  const values = templateValues(facts, VERSION);
  const plan = new Plan(dir, dryRun);
  const agentsPath = join(dir, "AGENTS.md");
  if (!existsSync(agentsPath) || !readBlock(read(agentsPath), "rules")) {
    plan.notes.push("No ai-kit rules block in AGENTS.md: run `ai-kit init` (or `ai-kit init --merge` for an existing AGENTS.md) first.");
    return { plan, facts, failed: true };
  }

  // managed prompts: refresh; files whose marker line was deleted are the user's now
  for (const rel of templateFiles().filter((r) => r.startsWith(".ai/prompts/"))) {
    const fresh = fill(read(join(TEMPLATES, rel)), values);
    const target = join(dir, rel);
    if (!existsSync(target)) plan.write(rel, fresh, "create");
    else {
      const current = read(target);
      if (!current.split("\n", 1)[0].includes(MANAGED)) plan.record("keep", rel, "your own version (marker line removed)");
      else if (current === fresh) plan.record("keep", rel, "up to date");
      else plan.write(rel, fresh, "update");
    }
  }

  // AGENTS.md: the whole rules block (marker carries the version) + a fresh docs index
  const current = read(agentsPath);
  const freshAgents = fill(read(join(TEMPLATES, "AGENTS.md")), values);
  const freshRules = freshAgents.match(/<!-- ai-kit:rules\b[\s\S]*?<!-- \/ai-kit:rules -->/)[0];
  let next = current.replace(/<!-- ai-kit:rules\b[\s\S]*?<!-- \/ai-kit:rules -->/, () => freshRules);
  if (!readBlock(next, "docs-index")) {
    // older file without an index block: add one right after the rules
    const indexBlock = freshAgents.match(/## Docs Index\n<!-- ai-kit:docs-index\b[\s\S]*?<!-- \/ai-kit:docs-index -->/)[0];
    next = next.replace(/<!-- \/ai-kit:rules -->/, (m) => `${m}\n\n${indexBlock}`);
  }
  next = withIndex(next, dir, plan);
  if (next === current) plan.record("keep", "AGENTS.md", "up to date");
  else plan.write("AGENTS.md", next, "update", "rules block and Docs Index refreshed; Project notes untouched");

  const metaPath = join(dir, ".ai/ai-kit.json");
  const meta = { ...(readJsonSafe(metaPath) ?? {}), version: VERSION, updated: new Date().toISOString().slice(0, 10) };
  plan.write(".ai/ai-kit.json", `${JSON.stringify(meta, null, 2)}\n`, existsSync(metaPath) ? "update" : "create");
  return { plan, facts };
}

// ---------------------------------------------------------------- doctor

/**
 * Check a project's AI setup. Findings: { level: "error" | "warn" | "info", message, fix? }.
 * With fix, the Docs Index is regenerated (nothing else is changed).
 */
export function doctor(dir, { fix = false, dryRun = false } = {}) {
  const findings = [];
  const add = (level, message, hint) => findings.push({ level, message, hint });
  const plan = new Plan(dir, dryRun);
  const agentsPath = join(dir, "AGENTS.md");

  // secrets in git (checked first: it matters whatever else is set up)
  if (existsSync(join(dir, ".git"))) {
    const r = spawnSync("git", ["ls-files", "--", ".env", "*.env", ".env.*"], { cwd: dir, encoding: "utf8" });
    const tracked = (r.stdout ?? "").split("\n").filter((f) => f && !/\.(example|sample|template)$/.test(f));
    if (tracked.length) add("error", `Secret files are committed to git: ${tracked.join(", ")}.`, "git rm --cached <file>, add it to .gitignore, and rotate the secrets in it");
  }
  if (!existsSync(agentsPath)) {
    add("error", "No AGENTS.md.", "npx github:Hazman97/ai-kit init");
    return { findings, plan };
  }
  const agents = read(agentsPath);
  const rules = readBlock(agents, "rules");
  if (!rules) add("warn", "AGENTS.md has no ai-kit rules block (hand-made or an older template).", "ai-kit init --merge");
  else {
    const v = rules.open.match(/ai-kit:rules v([\d.]+)/)?.[1];
    if (v && v !== VERSION) add("info", `Rules are v${v}; ai-kit is v${VERSION}.`, "ai-kit update");
  }

  for (const f of ["CLAUDE.md", "GEMINI.md"]) {
    const p = join(dir, f);
    if (!existsSync(p)) add("warn", `No ${f}: that agent will not read AGENTS.md automatically.`, "ai-kit init");
    else if (!IMPORTS_AGENTS.test(read(p))) add("warn", `${f} does not import AGENTS.md (add "@AGENTS.md" as its first line).`, "ai-kit init --merge");
  }

  // placeholders never filled, and docs referenced but missing
  // (the managed rules name docs generically, "when the project needs them": only the rest is checked)
  const own = agents.replace(/<!-- ai-kit:rules\b[\s\S]*?<!-- \/ai-kit:rules -->/, "");
  const placeholders = [...new Set(own.match(/<[A-Z][A-Z_]{2,}>|\{\{[A-Z_]+\}\}/g) ?? [])];
  if (placeholders.length) add("warn", `AGENTS.md still has placeholders: ${placeholders.join(", ")}.`, "replace them, or ai-kit init --merge");
  const optional = new Set(["LEARNINGS_ARCHIVE.md", "DEFINITION_OF_DONE.md", "LEARNINGS.md"]);
  const refs = [...new Set([...own.matchAll(/`((?:[\w.-]+\/)*[\w.-]+\.md)`/g)].map((m) => m[1]))];
  // the prompts the rules' table names must be in .ai/prompts/
  if (rules) {
    for (const [, name] of rules.body.matchAll(/^\| `([\w-]+\.md)` \|/gm)) {
      if (!existsSync(join(dir, ".ai/prompts", name))) add("warn", `The rules name the prompt \`.ai/prompts/${name}\`, which is missing.`, "ai-kit update");
    }
  }
  for (const ref of refs) {
    if (!existsSync(join(dir, ref))) {
      if (optional.has(ref)) continue;
      add("warn", `AGENTS.md refers to \`${ref}\`, which does not exist.`, ref.startsWith(".ai/") ? "ai-kit update" : "create it (e.g. with .ai/prompts/docs-update.md) or remove the reference");
    }
  }
  if (!existsSync(join(dir, "LEARNINGS.md"))) add("info", "No LEARNINGS.md.", "ai-kit init");

  // docs with older names
  for (const d of listDocs(dir)) {
    const legacy = LEGACY_NAMES.find(([re]) => re.test(d));
    if (legacy) add("info", `\`${d}\` uses an older name; the standard is ${legacy[1]}.`, "rename it (and update links) when convenient");
  }

  // the index matches the docs on disk
  const index = readBlock(agents, "docs-index");
  if (index) {
    const want = docsIndex(listDocs(dir), (f) => firstHeading(join(dir, f)));
    if (want.trim() !== index.body.trim()) {
      if (fix) plan.write("AGENTS.md", replaceBlock(agents, "docs-index", want), "update", "Docs Index regenerated");
      else add("warn", "The Docs Index in AGENTS.md does not match the docs on disk.", "ai-kit doctor --fix");
    }
  }

  // PROJECT.md filled?
  const project = join(dir, "docs/PROJECT.md");
  if (existsSync(project) && read(project).includes("_Not written yet._")) add("info", "docs/PROJECT.md still has empty sections.", 'ask your agent: "follow .ai/prompts/project-setup.md"');

  // LEARNINGS size
  const learnings = join(dir, "LEARNINGS.md");
  if (existsSync(learnings)) {
    const n = (read(learnings).match(/^## \[\d{4}-\d{2}-\d{2}\]/gm) ?? []).length;
    if (n > 30) add("info", `LEARNINGS.md has ${n} entries (over ~30).`, "ask your agent to propose an archive (AGENTS.md R22)");
  }

  return { findings, plan };
}

/**
 * An older AGENTS.md split into what ai-kit replaces (the generic template's "Working Principles" and
 * "Docs Index" sections) and what is the project's own (every other "## " section, kept as written).
 */
export function projectPart(text) {
  const body = text.replace(/^# AGENTS\.md\s*\n/, "");
  const parts = body.split(/^(?=## )/m);
  const dropped = [];
  const kept = [];
  for (const part of parts) {
    const heading = part.match(/^## (.+)$/m)?.[1]?.trim() ?? "";
    if (/^(Working Principles|Docs Index)\b/i.test(heading)) dropped.push(heading.replace(/\s*\(.*\)$/, ""));
    else if (part.trim()) kept.push(part.trim());
  }
  // shift the kept headings one level down: they sit under "## Project notes"
  return { kept: kept.join("\n\n").replace(/^(#{2,5}) /gm, "#$1 "), dropped };
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
