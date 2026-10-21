import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { detect, listDocs } from "./detect.js";
import { docsIndex, fill, firstHeading, indexTexts, readBlock, replaceBlock, templateValues } from "./render.js";

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
  /** Copy a file into .ai/backup/ (git-ignored) before changing it; an earlier backup is never overwritten. */
  backup(rel) {
    let to = `.ai/backup/${rel}`;
    for (let n = 2; existsSync(join(this.dir, to)); n++) to = `.ai/backup/${rel}.${n}`;
    this.record("backup", to, `copy of your ${rel}`);
    if (this.dryRun) return;
    mkdirSync(dirname(join(this.dir, to)), { recursive: true });
    copyFileSync(join(this.dir, rel), join(this.dir, to));
  }
}

// ---------------------------------------------------------------- .gitignore

/** Scratch files agents create. A signed-in browser profile holds session tokens: it must never be committed. */
const IGNORE_OPEN = "# ai-kit: scratch files AI agents make (screenshots, browser profiles, backups). Never commit them.";
const IGNORE_CLOSE = "# /ai-kit";
const IGNORE_LINES = [".ai/tmp/", ".ai/backup/", ".chrome*/", ".playwright-mcp/"];
const IGNORE_BLOCK = /# ai-kit:[^\n]*\n[\s\S]*?# \/ai-kit[^\n]*/;

/** Add (or refresh) the ai-kit block in .gitignore; the rest of the file is left exactly as it is. */
function ensureGitignore(dir, plan) {
  const path = join(dir, ".gitignore");
  const exists = existsSync(path);
  const raw = exists ? readFileSync(path, "utf8") : "";
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const block = [IGNORE_OPEN, ...IGNORE_LINES, IGNORE_CLOSE].join(eol);
  if (!exists) return plan.write(".gitignore", `${block}${eol}`, "create", "keeps agent scratch files out of git");
  const current = raw.replace(/\r\n/g, "\n");
  const found = current.match(IGNORE_BLOCK);
  if (found && found[0] === block.replace(/\r\n/g, "\n")) return plan.record("keep", ".gitignore", "ai-kit block up to date");
  const next = found
    ? raw.replace(/# ai-kit:[^\r\n]*\r?\n[\s\S]*?# \/ai-kit[^\r\n]*/, block)
    : `${raw}${raw && !raw.endsWith("\n") ? eol : ""}${raw ? eol : ""}${block}${eol}`;
  plan.write(".gitignore", next, "update", found ? "ai-kit block refreshed" : "ai-kit block added at the end; your lines untouched");
}

/** Untracked folders that are browser profiles (they hold cookies and signed-in sessions). */
function untrackedArtifacts(dir) {
  const r = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) return { profiles: [], screenshots: [] };
  const untracked = (r.stdout ?? "")
    .split("\n")
    .filter((l) => l.startsWith("?? "))
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const isProfile = (p) => ["Local State", "Default/Cookies", "Default/Network/Cookies"].some((f) => existsSync(join(dir, p, f)));
  return {
    profiles: untracked.filter((p) => p.endsWith("/") && isProfile(p)),
    screenshots: untracked.filter((p) => /(^|\/)screenshots?\/$/i.test(p) || /screenshot[^/]*\.(png|jpe?g|webp)$/i.test(p)),
  };
}

/** The docs the index should list once this run is done. */
function docsAfter(dir, plan) {
  const set = new Set(listDocs(dir));
  for (const a of plan.actions) if (a.kind === "create" && a.path.endsWith(".md") && (a.path.startsWith("docs/") || !a.path.includes("/"))) set.add(a.path);
  for (const f of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) set.delete(f);
  return [...set].sort();
}

function withIndex(text, dir, plan, previous = handWrittenIndex(dir, text)) {
  const index = docsIndex(docsAfter(dir, plan), (f) => firstHeading(join(dir, f)), previous);
  return replaceBlock(text, "docs-index", index) ?? text;
}

/**
 * The "Open when" texts a person wrote, so a regenerated index keeps them: from the current index, and
 * (as a fallback) from AGENTS.md backups — ai-kit 1.0 dropped them during `init --merge`.
 */
function handWrittenIndex(dir, agentsText) {
  const fromBackups = {};
  const backups = [join(dir, "AGENTS.md.ai-kit-backup"), ...safeListFiles(join(dir, ".ai/backup")).filter((f) => /^AGENTS\.md(\.\d+)?$/.test(f)).map((f) => join(dir, ".ai/backup", f))];
  for (const b of backups) if (existsSync(b)) Object.assign(fromBackups, indexTexts(read(b)));
  return { ...fromBackups, ...indexTexts(readBlock(agentsText ?? "", "docs-index")?.body) };
}

function safeListFiles(d) {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- init

/**
 * Set a project up, or bring it to the latest version — one command for every case:
 *  - no AGENTS.md: create every file;
 *  - AGENTS.md from ai-kit: refresh the rules block, the Docs Index and the managed prompts (as `update`);
 *  - any other AGENTS.md: back it up to .ai/backup/, put the latest rules on top, keep the project's own
 *    sections and its hand-written Docs Index texts. `merge: false` (`--no-merge`) leaves such files alone.
 * Files that belong to the project (LEARNINGS.md, docs/, prompts without the managed marker) are never changed.
 */
export function init(dir, { dryRun = false, merge = true } = {}) {
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
        refreshAgents(dir, plan, current, fresh);
      } else if (merge) {
        plan.backup(rel);
        const { kept, dropped, indexWhen } = projectPart(current);
        const indexed = withIndex(fresh, dir, plan, indexWhen);
        const merged = kept
          ? `${indexed.trimEnd()}\n\n### From the previous AGENTS.md (kept by \`ai-kit init\`)\n<!-- Remove anything the rules above already cover; keep only this project's own notes. -->\n\n${kept}\n`
          : indexed;
        const note = dropped.length ? `latest rules; the old ${dropped.map((d) => `"${d}"`).join(" and ")} replaced${kept ? ", your own sections kept under Project notes" : ""}` : "latest rules on top, your old file kept under Project notes";
        plan.write(rel, merged, "update", note);
      } else {
        plan.record("keep", rel, "exists without ai-kit blocks; left alone (--no-merge)");
        plan.notes.push("AGENTS.md was not changed. Run `ai-kit init` without --no-merge to add the rules (a backup is kept in .ai/backup/).");
      }
      continue;
    }
    if (rel === "CLAUDE.md" || rel === "GEMINI.md") {
      if (IMPORTS_AGENTS.test(current)) plan.record("keep", rel, "already imports AGENTS.md");
      else if (merge) {
        plan.backup(rel);
        plan.write(rel, `${fresh.split("\n")[0]}\n\n${current}`, "update", "now imports AGENTS.md first; your text kept below");
      } else plan.record("keep", rel, "exists; left alone (--no-merge)");
      continue;
    }
    if (rel.startsWith(".ai/prompts/")) {
      refreshPrompt(plan, rel, fresh, current);
      continue;
    }
    plan.record("keep", rel, "exists, never overwritten");
  }

  ensureGitignore(dir, plan);
  const meta = { version: VERSION, detected: detectedMeta(facts), updated: new Date().toISOString().slice(0, 10) };
  plan.write(".ai/ai-kit.json", `${JSON.stringify(meta, null, 2)}\n`, existsSync(join(dir, ".ai/ai-kit.json")) ? "update" : "create");
  return { plan, facts };
}

/** What .ai/ai-kit.json records about the project: the UI package and every package found. */
function detectedMeta(facts) {
  return {
    name: facts.name,
    framework: facts.framework,
    styling: facts.styling,
    frontendPath: facts.frontendPath,
    packages: facts.packages.map((p) => ({ path: p.path, role: p.role, framework: p.framework, backend: p.backend, styling: p.styling })),
  };
}

/** A managed prompt is refreshed; one whose marker line was deleted is the user's own and is kept. */
function refreshPrompt(plan, rel, fresh, current) {
  if (!current.split("\n", 1)[0].includes(MANAGED)) plan.record("keep", rel, "your own version (marker line removed)");
  else if (current === fresh) plan.record("keep", rel, "up to date");
  else plan.write(rel, fresh, "update");
}

/** AGENTS.md set up by ai-kit: replace the whole rules block (its marker carries the version) and regenerate the index. */
function refreshAgents(dir, plan, current, freshAgents) {
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
}

// ---------------------------------------------------------------- update

export function update(dir, { dryRun = false } = {}) {
  const facts = detect(dir);
  const values = templateValues(facts, VERSION);
  const plan = new Plan(dir, dryRun);
  const agentsPath = join(dir, "AGENTS.md");
  if (!existsSync(agentsPath) || !readBlock(read(agentsPath), "rules")) {
    plan.notes.push("No ai-kit rules block in AGENTS.md: run `ai-kit init` first (it converts an existing AGENTS.md and keeps your notes).");
    return { plan, facts, failed: true };
  }

  for (const rel of templateFiles().filter((r) => r.startsWith(".ai/prompts/"))) {
    const fresh = fill(read(join(TEMPLATES, rel)), values);
    const target = join(dir, rel);
    if (!existsSync(target)) plan.write(rel, fresh, "create");
    else refreshPrompt(plan, rel, fresh, read(target));
  }
  refreshAgents(dir, plan, read(agentsPath), fill(read(join(TEMPLATES, "AGENTS.md")), values));

  ensureGitignore(dir, plan);
  const metaPath = join(dir, ".ai/ai-kit.json");
  // re-detect: an older run may have recorded a wrong guess (e.g. `framework: null` for a frontend/ + backend/ repo)
  const meta = { ...(readJsonSafe(metaPath) ?? {}), version: VERSION, detected: detectedMeta(facts), updated: new Date().toISOString().slice(0, 10) };
  plan.write(".ai/ai-kit.json", `${JSON.stringify(meta, null, 2)}\n`, existsSync(metaPath) ? "update" : "create");
  return { plan, facts };
}

// ---------------------------------------------------------------- next steps

/**
 * The one-time setup prompts this project still needs, after init. Each is said once per project: later
 * sessions read the docs on their own (AGENTS.md R14, R24), so a project that is already set up gets none.
 */
export function nextSteps(dir, facts) {
  const steps = [];
  const project = join(dir, "docs/PROJECT.md");
  if (!existsSync(project) || read(project).includes("_Not written yet._")) {
    steps.push({ say: "follow .ai/prompts/project-setup.md", does: "fills docs/PROJECT.md from the code" });
  }
  if (facts.frontend && !existsSync(join(dir, "docs/FRONTEND.md"))) {
    steps.push({ say: "follow .ai/prompts/frontend-setup.md", does: "writes docs/FRONTEND.md (styling + phone rules)" });
  }
  return steps;
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

    // what agents leave behind: a signed-in browser profile is one `git add .` away from leaking a session
    const { profiles, screenshots } = untrackedArtifacts(dir);
    if (profiles.length) add("error", `Browser profile folder${profiles.length > 1 ? "s" : ""} not ignored by git: ${profiles.join(", ")} (cookies and signed-in sessions inside).`, "delete them when the agent is done; `ai-kit update` adds .chrome*/ and .ai/tmp/ to .gitignore");
    if (screenshots.length) add("warn", `Untracked screenshots: ${screenshots.join(", ")}.`, "move them to .ai/tmp/ (git-ignored) or delete them");
  }
  const gitignore = join(dir, ".gitignore");
  if (!existsSync(gitignore) || !IGNORE_BLOCK.test(read(gitignore))) add("info", "No ai-kit block in .gitignore (agent scratch files could get committed).", "ai-kit update");
  if (!existsSync(agentsPath)) {
    add("error", "No AGENTS.md.", "npx github:Hazman97/ai-kit init");
    return { findings, plan };
  }
  const agents = read(agentsPath);
  const rules = readBlock(agents, "rules");
  if (!rules) add("warn", "AGENTS.md has no ai-kit rules block (hand-made or an older template).", "ai-kit init (backs it up, adds the rules, keeps your notes)");
  else {
    const v = rules.open.match(/ai-kit:rules v([\d.]+)/)?.[1];
    if (v && v !== VERSION) add("info", `Rules are v${v}; ai-kit is v${VERSION}.`, "ai-kit update");
  }

  for (const f of ["CLAUDE.md", "GEMINI.md"]) {
    const p = join(dir, f);
    if (!existsSync(p)) add("warn", `No ${f}: that agent will not read AGENTS.md automatically.`, "ai-kit init");
    else if (!IMPORTS_AGENTS.test(read(p))) add("warn", `${f} does not import AGENTS.md (add "@AGENTS.md" as its first line).`, "ai-kit init");
  }

  // placeholders never filled, and docs referenced but missing
  // (the managed rules name docs generically, "when the project needs them": only the rest is checked)
  const own = agents.replace(/<!-- ai-kit:rules\b[\s\S]*?<!-- \/ai-kit:rules -->/, "");
  const placeholders = [...new Set(own.match(/<[A-Z][A-Z_]{2,}>|\{\{[A-Z_]+\}\}/g) ?? [])];
  if (placeholders.length) add("warn", `AGENTS.md still has placeholders: ${placeholders.join(", ")}.`, "replace them, or run ai-kit init");
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

  // Docs under non-standard names are not reported: R23 keeps a project's own doc names and the Docs Index
  // maps them. Asking people to rename working docs only broke their links.

  // the index matches the docs on disk
  const index = readBlock(agents, "docs-index");
  if (index) {
    const want = docsIndex(listDocs(dir), (f) => firstHeading(join(dir, f)), handWrittenIndex(dir, agents));
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
 * From the old Docs Index, the hand-written "Open when" texts are returned as `indexWhen` (the new index
 * reuses them) and any prose around the table is kept with the project's notes.
 */
export function projectPart(text) {
  const body = text.replace(/\r\n/g, "\n").replace(/^# AGENTS\.md\s*\n/, "");
  const parts = body.split(/^(?=## )/m);
  const dropped = [];
  const kept = [];
  let indexWhen = {};
  for (const part of parts) {
    const heading = part.match(/^## (.+)$/m)?.[1]?.trim() ?? "";
    if (/^Working Principles\b/i.test(heading)) dropped.push("Working Principles");
    else if (/^Docs Index\b/i.test(heading)) {
      dropped.push("Docs Index");
      indexWhen = indexTexts(part);
      const prose = part
        .split("\n")
        .slice(1) // the heading
        .filter((l) => !/^\s*\|/.test(l) && !/^\s*<!--.*-->\s*$/.test(l))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n") // where the table was
        .trim();
      if (prose) kept.push(`## Notes from the old Docs Index\n\n${prose}`);
    } else if (part.trim()) kept.push(part.trim());
  }
  // shift the kept headings one level down: they sit under "## Project notes"
  return { kept: kept.join("\n\n").replace(/^(#{2,5}) /gm, "#$1 "), dropped, indexWhen };
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
