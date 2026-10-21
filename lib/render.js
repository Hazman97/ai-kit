import { readFileSync } from "node:fs";

/** Fill {{NAME}} placeholders; unknown names are left as they are. */
export function fill(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
}

/** The values the templates use, from what detect() found. */
export function templateValues(facts, version) {
  const c = facts.commands;
  const rows = [
    ["Run in development", c.dev],
    ["Build", c.build],
    ["Tests", c.test],
    ["Lint", c.lint],
    ["Type check", c.typecheck],
  ].filter(([, cmd]) => cmd);
  const checks = [c.typecheck, c.lint, c.test, c.build].filter(Boolean);
  return {
    KIT_VERSION: version,
    PROJECT_NAME: facts.name,
    STACK: facts.stack.join("\n"),
    COMMANDS: rows.length ? rows.map(([t, cmd]) => `| ${t} | \`${cmd}\` |`).join("\n") : "| _None detected_ | _add the real commands_ |",
    CHECK_COMMANDS: checks.length ? `${checks.map((x) => `\`${x}\``).join(", ")} pass.` : "The project's typecheck, tests and build pass (see docs/PROJECT.md → Commands).",
    DEV_COMMAND: c.dev ? `\`${c.dev}\`` : "see docs/PROJECT.md → Commands",
    FRONTEND_DETECTED: facts.frontend ? [facts.framework, facts.styling].filter(Boolean).join(", ") : "no frontend framework found in package.json",
    STYLING_RULES: stylingRules(facts.tailwind),
  };
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

/** Older names from earlier templates → the standard name. */
export const LEGACY_NAMES = [
  [/^docs\/API_REFERENCE\.md$/i, "docs/API.md"],
  [/^docs\/ARCHITECTURE(_AND_FLOWS)?\.md$/i, "docs/PROJECT.md (Structure / Key decisions)"],
  [/^docs\/DATABASE_AND_[A-Z_]+\.md$/i, "docs/DATABASE.md"],
  [/^docs\/OPS_AND_SECURITY\.md$/i, "docs/OPS.md"],
  [/^docs\/PROJECT_TRACKING\.md$/i, "docs/PROJECT.md (Not done yet) or your issue tracker"],
];

/** The Docs Index table for the docs that exist (standard first, then others by name). */
export function docsIndex(docs, titleOf) {
  const rows = [];
  for (const [file, when] of Object.entries(STANDARD_DOCS)) if (docs.includes(file)) rows.push([file, when]);
  for (const file of docs) {
    if (file in STANDARD_DOCS) continue;
    const title = titleOf(file);
    rows.push([file, title ? `Task touches: ${title}` : "Task touches this topic"]);
  }
  return ["| Doc | Open when… |", "|---|---|", ...rows.map(([f, w]) => `| \`${f}\` | ${w} |`)].join("\n");
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
