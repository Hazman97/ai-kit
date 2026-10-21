#!/usr/bin/env node
import { resolve } from "node:path";
import { VERSION, doctor, init, nextSteps, update } from "../lib/commands.js";

const HELP = `ai-kit ${VERSION} — the same AI-agent setup in every project

Usage (run inside your project folder):
  npx github:Hazman97/ai-kit init             set up a project, or bring it to the latest version:
                                              new files are created; an existing AGENTS.md gets the
                                              latest rules and keeps its own notes (backup in .ai/backup/)
  npx github:Hazman97/ai-kit init --no-merge  leave an existing AGENTS.md / CLAUDE.md / GEMINI.md untouched
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
  // converting an existing AGENTS.md is the default; --merge is still accepted from 1.0 docs
  const { plan, facts } = init(dir, { dryRun, merge: !flag("--no-merge") });
  showFacts(facts);
  console.log(bold("Files:"));
  showPlan(plan);
  if (!dryRun) {
    const steps = nextSteps(dir, facts);
    if (steps.length) {
      console.log(`\n${bold("One-time setup")} ${dim("(once per project; later sessions read these docs on their own)")}`);
      console.log("  Open the project with your AI agent and say:");
      for (const s of steps) console.log(`  "${s.say}"${" ".repeat(Math.max(1, 40 - s.say.length))}${dim(`→ ${s.does}`)}`);
      console.log(dim("  Forget it? The agent offers to do it itself when it finds the doc empty (AGENTS.md R24)."));
    } else {
      console.log(`\n${bold("Ready.")} Nothing to say to your agent: it reads AGENTS.md and the docs on its own.`);
    }
    console.log(`  Commit the changed files. Check any time with: npx github:Hazman97/ai-kit doctor`);
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
