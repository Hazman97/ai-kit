#!/usr/bin/env node
import { resolve } from "node:path";
import { VERSION, doctor, init, update } from "../lib/commands.js";

const HELP = `ai-kit ${VERSION} — the same AI-agent setup in every project

Usage (run inside your project folder):
  npx github:Hazman97/ai-kit init             add AGENTS.md, CLAUDE.md, GEMINI.md, LEARNINGS.md,
                                              docs/PROJECT.md and .ai/prompts/ (never overwrites)
  npx github:Hazman97/ai-kit init --merge     also convert an existing AGENTS.md / CLAUDE.md / GEMINI.md
                                              (backups are kept as *.ai-kit-backup)
  npx github:Hazman97/ai-kit update           newer rules + prompts; your notes are not touched
  npx github:Hazman97/ai-kit doctor           check for missing docs, placeholders, stale index, secrets
  npx github:Hazman97/ai-kit doctor --fix     also regenerate the Docs Index

Options:
  --dry-run     show what would change, change nothing
  --dir <path>  the project folder (default: the current folder)
  -h, --help    this help
  -v, --version the version
`;

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const dirArg = args.indexOf("--dir");
const dir = resolve(dirArg >= 0 ? args[dirArg + 1] ?? "." : ".");
const cmd = args.find((a, i) => !a.startsWith("-") && args[i - 1] !== "--dir");
const dryRun = flag("--dry-run");

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint(32, s);
const yellow = (s) => paint(33, s);
const red = (s) => paint(31, s);
const dim = (s) => paint(2, s);
const bold = (s) => paint(1, s);

const MARK = { create: green("+ created"), update: yellow("~ updated"), keep: dim("= kept   "), backup: dim("⤷ backup ") };

function showPlan(plan) {
  for (const a of plan.actions) console.log(`  ${MARK[a.kind]}  ${a.path}${a.note ? dim(`  (${a.note})`) : ""}`);
  for (const n of plan.notes) console.log(`\n  ${yellow("!")} ${n}`);
  if (plan.dryRun) console.log(`\n  ${yellow("dry run:")} nothing was written.`);
}

function showFacts(facts) {
  console.log(`\n${bold("Project:")} ${facts.name}`);
  for (const line of facts.stack) console.log(`  ${line.replace(/^- /, "· ")}`);
  const cmds = Object.entries(facts.commands).filter(([, v]) => v);
  if (cmds.length) console.log(`  · commands: ${cmds.map(([k, v]) => `${k} = ${v}`).join(", ")}`);
  console.log("");
}

if (flag("-v") || flag("--version")) {
  console.log(VERSION);
} else if (!cmd || flag("-h") || flag("--help")) {
  console.log(HELP);
} else if (cmd === "init") {
  const { plan, facts } = init(dir, { dryRun, merge: flag("--merge") });
  showFacts(facts);
  console.log(bold("Files:"));
  showPlan(plan);
  if (!dryRun) {
    console.log(`\n${bold("Next:")} open the project with your AI agent and say:`);
    console.log(`  "follow .ai/prompts/project-setup.md"   ${dim("→ fills docs/PROJECT.md from the code")}`);
    if (facts.frontend) console.log(`  "follow .ai/prompts/frontend-setup.md"  ${dim("→ writes docs/FRONTEND.md (styling + phone rules)")}`);
    console.log(`  Then commit the new files. Check later with: npx github:Hazman97/ai-kit doctor`);
  }
} else if (cmd === "update") {
  const { plan, failed } = update(dir, { dryRun });
  console.log(`\n${bold(`ai-kit ${VERSION}: update`)}`);
  showPlan(plan);
  if (failed) process.exitCode = 1;
} else if (cmd === "doctor") {
  const { findings, plan } = doctor(dir, { fix: flag("--fix"), dryRun });
  console.log(`\n${bold(`ai-kit ${VERSION}: doctor`)}  ${dim(dir)}\n`);
  if (!findings.length && !plan.actions.length) console.log(`  ${green("✓")} All good.`);
  const icon = { error: red("✗"), warn: yellow("!"), info: dim("i") };
  for (const f of findings) console.log(`  ${icon[f.level]} ${f.message}${f.hint ? `\n      ${dim(`→ ${f.hint}`)}` : ""}`);
  if (plan.actions.length) {
    console.log("");
    showPlan(plan);
  }
  const errors = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  if (findings.length) console.log(`\n  ${errors} error(s), ${warns} warning(s), ${findings.length - errors - warns} note(s).`);
  if (errors) process.exitCode = 1;
} else {
  console.error(`Unknown command "${cmd}".\n`);
  console.log(HELP);
  process.exitCode = 1;
}
