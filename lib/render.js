import { readFileSync } from "node:fs";

/** Fill {{NAME}} placeholders; unknown names are left as they are. */
export function fill(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
}

/** The values the templates use, from what detect() found. */
export function templateValues(facts, version) {
  // UI prompts run inside the frontend package, so they use its commands first
  const c = facts.uiCommands ?? facts.commands;
  const rows = facts.commandRows ?? [];
  const checks = [c.typecheck, c.lint, c.test, c.build].filter(Boolean);
  return {
    KIT_VERSION: version,
    PROJECT_NAME: facts.name,
    STACK: facts.stack.join("\n"),
    COMMANDS: rows.length ? rows.map(([t, cmd]) => `| ${t} | \`${cmd}\` |`).join("\n") : "| _None detected_ | _add the real commands_ |",
    CHECK_COMMANDS: checks.length ? `${checks.map((x) => `\`${x}\``).join(", ")} pass.` : "The project's typecheck, tests and build pass (see docs/PROJECT.md → Commands).",
    DEV_COMMAND: c.dev ? `\`${c.dev}\`` : "see docs/PROJECT.md → Commands",
    FRONTEND_DETECTED: frontendDetected(facts),
    BACKEND_DETECTED: backendDetected(facts),
    DATA_DETECTED: dataDetected(facts),
    STYLING_RULES: stylingRules(facts.tailwind),
  };
}

/** What the frontend prompt is told about the UI code. Agents trust this line, so it never claims "none" as fact. */
function frontendDetected(facts) {
  if (!facts.frontend) {
    return "no frontend framework found in any package.json (root and sub-folders checked); confirm from the code before assuming there is no UI";
  }
  const what = [facts.framework, facts.styling].filter(Boolean).join(", ");
  const where = facts.frontendPath && facts.frontendPath !== "." ? ` in \`${facts.frontendPath}/\`` : "";
  const more = (facts.frontends ?? []).filter((p) => p !== facts.frontendPath);
  return `${what}${where}${more.length ? `; other UI packages: ${more.map((p) => `\`${p === "." ? "root" : `${p}/`}\``).join(", ")}` : ""}`;
}

const where = (p) => (p === "." ? "root" : `\`${p}/\``);

/** What the API prompt is told about the server code (never "none" as fact, like frontendDetected). */
function backendDetected(facts) {
  const servers = (facts.packages ?? []).filter((p) => p.server || ["backend", "fullstack"].includes(p.role));
  if (!servers.length) return "no server framework found in any manifest (root and sub-folders checked); confirm from the code before assuming there is no API";
  return servers.map((p) => `${p.server ?? p.framework ?? p.role} in ${where(p.path)}`).join("; ");
}

/** What the database prompt is told about storage: data libraries and bindings per package. */
function dataDetected(facts) {
  const stores = (facts.packages ?? []).filter((p) => p.data?.length);
  if (!stores.length) return "no database library or storage binding found; confirm from the code (raw SQL, an HTTP API, files…)";
  return stores.map((p) => `${p.data.join(", ")} in ${where(p.path)}`).join("; ");
}

/** Tailwind v3 and v4 differ: the rules an agent must follow for this project's version. */
function stylingRules(tailwind) {
  if (tailwind === 4)
    return [
      "- Tailwind v4: the spacing scale is dynamic (1 unit = 0.25rem = 4px, decimals allowed). Write canonical",
      "  classes, not arbitrary pixels: `max-w-30` not `max-w-[120px]`, `min-h-11` not `min-h-[44px]`.",
      "- `!important` goes at the end in v4: `mb-0!`, not `!mb-0`.",
      "- Keep brackets only for non-spacing values: `text-[11px]`, `grid-cols-[…]`, `shadow-[…]`, `calc()`.",
      '- Check: `grep -rnE "\\-\\[[0-9.]+px\\]" src | grep -vE "text-\\[|leading-\\[|tracking-\\["` prints nothing.',
    ].join("\n");
  if (tailwind === 3)
    return [
      "- Tailwind v3: use the configured scale (`tailwind.config.*` → theme); avoid arbitrary `[Npx]` values when a",
      "  scale step exists; extend the theme instead of repeating the same arbitrary value.",
      "- `!important` is a prefix in v3: `!mb-0`.",
    ].join("\n");
  return "- Follow the project's existing CSS approach (list it here: CSS modules, Sass, styled-components…).";
}

/** Replace the content of a managed block (keeps the markers). Returns null if the block is not there. */
export function replaceBlock(text, name, body) {
  const re = new RegExp(`(<!-- ai-kit:${name}\\b[^>]*-->)([\\s\\S]*?)(<!-- /ai-kit:${name} -->)`);
  if (!re.test(text)) return null;
  return text.replace(re, (_m, open, _old, close) => `${open}\n${body.trim()}\n${close}`);
}

/** The text inside a managed block, with its opening marker (null if absent). */
export function readBlock(text, name) {
  const m = text.match(new RegExp(`(<!-- ai-kit:${name}\\b[^>]*-->)([\\s\\S]*?)<!-- /ai-kit:${name} -->`));
  return m ? { open: m[1], body: m[2].trim() } : null;
}

/** Standard docs and when to open them (AGENTS.md R23). */
export const STANDARD_DOCS = {
  "LEARNINGS.md": "Always, at the start of a session (R20)",
  "LEARNINGS_ARCHIVE.md": "Only for full history or an audit",
  "README.md": "Once per session: setup and overview",
  "docs/PROJECT.md": "Once per session: what it is, stack, commands, structure",
  "docs/API.md": "Endpoints, events, payloads, API auth",
  "docs/DATABASE.md": "Schema, queries, migrations, anything stored",
  "docs/FRONTEND.md": "Any UI, component or styling task (R14)",
  "docs/OPS.md": "Deploy, environments, servers, secrets, security",
};


/**
 * The Docs Index table for the docs that exist (standard first, then others by name).
 * `previous` maps a doc (or a `docs/X_*.md` pattern) to the "Open when" text a person wrote for it; that text
 * is kept, so regenerating the index never throws away a hand-written trigger.
 */
export function docsIndex(docs, titleOf, previous = {}) {
  const written = (file) => {
    if (previous[file]) return previous[file];
    const hit = Object.entries(previous).find(([k]) => k.includes("*") && globToRegExp(k).test(file));
    return hit?.[1] ?? null;
  };
  const rows = [];
  for (const [file, when] of Object.entries(STANDARD_DOCS)) if (docs.includes(file)) rows.push([file, written(file) ?? when]);
  for (const file of docs) {
    if (file in STANDARD_DOCS) continue;
    const title = titleOf(file);
    rows.push([file, written(file) ?? (title ? `Tasks about ${title} (edit this line: say when to open it)` : "Edit this line: say when to open it")]);
  }
  return ["| Doc | Open when… |", "|---|---|", ...rows.map(([f, w]) => `| \`${f}\` | ${w} |`)].join("\n");
}

/** Standard texts earlier templates wrote (the AGENTS.md template's starter index). */
const OLD_STANDARD_WHEN = new Set(["Once per session: overview, stack, commands"]);

/** Generated "Open when" texts (this and earlier versions): never treated as hand-written. */
const GENERATED_WHEN = /^(Task touches( this topic|: .*)|Tasks about .* \(edit this line: say when to open it\)|Edit this line: say when to open it)$/;

/**
 * The hand-written "Open when" texts in a Docs Index table: { "docs/X.md": "when…" }.
 * Rows with placeholders (`<NAME>`) and generated texts are skipped.
 */
export function indexTexts(text) {
  const out = {};
  for (const [, file, when] of (text ?? "").matchAll(/^\|\s*`([^`]+\.md)`\s*\|\s*(.+?)\s*\|\s*$/gm)) {
    if (/<[^>]+>/.test(file) || GENERATED_WHEN.test(when) || !when.trim()) continue;
    if (Object.values(STANDARD_DOCS).includes(when) || OLD_STANDARD_WHEN.has(when)) continue; // ai-kit's own text

    out[file] = when;
  }
  return out;
}

function globToRegExp(glob) {
  return new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
}

/** The first heading of a markdown file (for the index), or null. */
export function firstHeading(path) {
  try {
    const m = readFileSync(path, "utf8").match(/^#\s+(.+)$/m);
    return m ? m[1].trim().slice(0, 70) : null;
  } catch {
    return null;
  }
}
