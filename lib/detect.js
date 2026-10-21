import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/** Folders never scanned for packages: dependencies, build output, caches, virtualenvs, sample code. */
const SKIP_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "coverage", "bin", "obj",
  "venv", "__pycache__", "site-packages", "Pods", "DerivedData",
  "fixtures", "__fixtures__", "examples", "example", "templates", "tmp", "temp",
]);
const MAX_DEPTH = 3; // root = 0; `apps/web` = 2; `services/api/app` = 3
const MAX_DIRS = 2000; // a bound for very large trees; a normal repo stays far below it

/** Manifest files that mark a folder as a package/app of its own. */
const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "composer.json", "Gemfile", "pubspec.yaml"];

/** Meta-frameworks render the UI and also serve the backend. */
const META_FRAMEWORKS = new Set(["next", "nuxt", "@sveltejs/kit", "@remix-run/react", "@react-router/dev", "astro"]);

/**
 * Work out what a project is made of, from its files only (nothing is run).
 * Reads the root AND every sub-folder with its own manifest — a `frontend/` + `backend/` repo,
 * `apps/*` + `packages/*` workspaces, a Python API next to a React app — and labels each one
 * (frontend, backend, fullstack, mobile, desktop, package).
 * Returns the facts the templates need: name, stack lines, commands, frontend details, packages.
 */
export function detect(dir) {
  const rootPkg = readJson(join(dir, "package.json"));
  const runner = packageRunner(dir);
  const packages = findPackageDirs(dir).map((rel) => describe(dir, rel, runner));
  const root = packages.find((p) => p.path === ".") ?? null;
  const subs = packages.filter((p) => p.path !== ".");
  const single = subs.length === 0; // only the root: keep the flat, one-package wording

  const ui = packages.find((p) => p.role === "frontend" || p.role === "fullstack" || p.role === "mobile") ?? null;

  const stack = [];
  const js = packages.filter((p) => p.kind === "js");
  if (js.length) {
    const ts = js.some((p) => p.has("typescript"));
    stack.push(`- Runtime: ${runner === "bun run" ? "Bun" : "Node.js"}${ts ? " + TypeScript" : ""} (package manager: ${runner.split(" ")[0]})`);
  }
  if (single) {
    if (root) stack.push(...root.lines);
    if (isWorkspace(rootPkg)) stack.push("- Monorepo: workspaces in package.json");
  } else {
    for (const p of packages) {
      if (p.role === "root") continue;
      const where = p.path === "." ? "root" : `${p.path}/`;
      const what = p.lines.map((l) => l.replace(/^- /, "")).join(" · ");
      stack.push(`- \`${where}\` (${p.role})${what ? `: ${what}` : ""}`);
    }
    const listed = subs.map((p) => `\`${p.path}/\``).join(", ");
    const notes = [root?.role === "root" && "the root package.json only holds scripts", isWorkspace(rootPkg) && "workspaces in package.json"].filter(Boolean);
    stack.push(`- Layout: ${subs.length} package${subs.length === 1 ? "" : "s"} (${listed})${notes.length ? `; ${notes.join("; ")}` : ""}`);
  }
  if (existsSync(join(dir, "Dockerfile")) || existsSync(join(dir, "docker-compose.yml")) || existsSync(join(dir, "compose.yaml"))) stack.push("- Docker files present");
  if (!stack.length) stack.push("- _Not detected: fill in by hand or with `.ai/prompts/project-setup.md`._");

  // One command per task: the root's own script wins, else the first package that has one.
  const KEYS = ["dev", "build", "test", "lint", "typecheck"];
  const pick = (order) => Object.fromEntries(KEYS.map((k) => [k, order.map((p) => p.commands[k]).find(Boolean) ?? null]));
  const commands = pick([root, ...subs].filter(Boolean));
  // UI work happens inside the frontend package, so its own commands come first for UI tasks.
  const uiCommands = pick([ui, root, ...subs].filter(Boolean));

  return {
    name: rootPkg?.name || basename(dir),
    hasPackage: js.length > 0,
    framework: ui?.framework ?? null,
    tailwind: ui?.tailwind ?? null,
    styling: ui?.styling ?? null,
    frontend: !!ui,
    frontendPath: ui?.path ?? null,
    frontends: packages.filter((p) => ["frontend", "fullstack", "mobile"].includes(p.role)).map((p) => p.path),
    stack,
    commands,
    uiCommands,
    commandRows: commandRows(root, subs),
    packages: packages.map(({ has, lines, ...p }) => p),
  };
}

/** Every folder (relative, "/"-separated, root = ".") that has a manifest, within the scan bounds. */
function findPackageDirs(dir) {
  const found = [];
  let seen = 0;
  const walk = (rel, depth) => {
    if (++seen > MAX_DIRS) return;
    const entries = safeEntries(rel === "." ? dir : join(dir, rel));
    const isPkg = entries.some((e) => e.isFile() && MANIFESTS.includes(e.name));
    if (isPkg) found.push(rel);
    // A sub-package's own folders are its source, not more packages: only the root is searched through.
    if ((isPkg && rel !== ".") || depth >= MAX_DEPTH) return;
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      walk(rel === "." ? e.name : `${rel}/${e.name}`, depth + 1);
    }
  };
  walk(".", 0);
  return found;
}

/** What one package folder is: kind (js, python…), role, framework, styling, backend, commands. */
function describe(dir, rel, runner) {
  const abs = rel === "." ? dir : join(dir, rel);
  const pkg = readJson(join(abs, "package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const has = (name) => name in deps;
  const major = (name) => {
    const v = String(deps[name] ?? "").match(/\d+/);
    return v ? Number(v[0]) : null;
  };
  const scripts = pkg?.scripts ?? {};
  // `cd x && …` works in sh, cmd and PowerShell 7, whichever package manager is used
  const prefix = rel === "." ? "" : `cd ${rel} && `;
  const script = (...names) => {
    const n = names.find((x) => x in scripts);
    return n ? `${prefix}${runner} ${n}` : null;
  };

  // frontend framework (most specific first)
  const fw = [
    ["next", () => `Next.js ${major("next") ?? ""}`],
    ["nuxt", () => `Nuxt ${major("nuxt") ?? ""}`],
    ["@sveltejs/kit", () => "SvelteKit"],
    ["@remix-run/react", () => "Remix"],
    ["@react-router/dev", () => "React Router (framework mode)"],
    ["astro", () => "Astro"],
    ["expo", () => "Expo (React Native)"],
    ["react-native", () => "React Native"],
    ["@angular/core", () => `Angular ${major("@angular/core") ?? ""}`],
    ["vue", () => `Vue ${major("vue") ?? ""}`],
    ["react", () => `React ${major("react") ?? ""}`],
    ["svelte", () => "Svelte"],
    ["solid-js", () => "SolidJS"],
    ["preact", () => "Preact"],
    ["lit", () => "Lit"],
  ].find(([name]) => has(name));
  const framework = fw ? fw[1]().trim() : null;

  const tailwind = has("tailwindcss") || has("@tailwindcss/vite") || has("@tailwindcss/postcss") ? (major("tailwindcss") ?? (has("@tailwindcss/vite") || has("@tailwindcss/postcss") ? 4 : null)) : null;
  const styling = tailwind ? `Tailwind CSS v${tailwind}` : has("sass") ? "Sass" : has("styled-components") ? "styled-components" : has("@emotion/react") ? "Emotion" : null;

  const platform = has("wrangler") ? "Cloudflare Workers" : null;
  const backend =
    (has("hono") && "Hono") ||
    (has("@nestjs/core") && "NestJS") ||
    (has("fastify") && "Fastify") ||
    (has("express") && "Express") ||
    (has("koa") && "Koa") ||
    (has("elysia") && "Elysia") ||
    (has("@hapi/hapi") && "hapi") ||
    (has("@adonisjs/core") && "AdonisJS") ||
    (has("firebase-functions") && "Firebase Functions") ||
    (platform && !framework && platform) ||
    null;

  // other ecosystems: look for a known web/app framework in the manifest text
  const text = (f) => {
    try {
      return readFileSync(join(abs, f), "utf8").toLowerCase();
    } catch {
      return "";
    }
  };
  const other = []; // [label, role | null]
  const py = text("pyproject.toml") + text("requirements.txt");
  if (py) {
    const f = [["django", "Django", "backend"], ["fastapi", "FastAPI", "backend"], ["flask", "Flask", "backend"], ["streamlit", "Streamlit", "frontend"]].find(([k]) => new RegExp(`\\b${k}\\b`).test(py));
    other.push([`Python${f ? ` (${f[1]})` : ""}`, f?.[2] ?? null]);
  }
  const go = text("go.mod");
  if (go) {
    const f = [["gin-gonic/gin", "Gin"], ["labstack/echo", "Echo"], ["gofiber/fiber", "Fiber"], ["go-chi/chi", "chi"]].find(([k]) => go.includes(k));
    other.push([`Go${f ? ` (${f[1]})` : ""}`, f ? "backend" : null]);
  }
  const rust = text("Cargo.toml");
  if (rust) {
    const f = [["axum", "Axum", "backend"], ["actix-web", "Actix Web", "backend"], ["rocket", "Rocket", "backend"], ["tauri", "Tauri", "desktop"]].find(([k]) => new RegExp(`^\\s*${k}\\s*=`, "m").test(rust));
    other.push([`Rust${f ? ` (${f[1]})` : ""}`, f?.[2] ?? null]);
  }
  const php = text("composer.json");
  if (php) {
    const f = [["laravel/framework", "Laravel"], ["symfony/framework-bundle", "Symfony"]].find(([k]) => php.includes(`"${k}"`));
    other.push([`PHP${f ? ` (${f[1]})` : ""}`, f ? "backend" : null]);
  }
  const ruby = text("Gemfile");
  if (ruby) {
    const rails = /gem\s+["']rails["']/.test(ruby);
    other.push([`Ruby${rails ? " (Rails)" : ""}`, rails ? "backend" : null]);
  }
  const dart = text("pubspec.yaml");
  if (dart) {
    const flutter = /^\s*flutter:/m.test(dart);
    other.push([flutter ? "Flutter / Dart" : "Dart", flutter ? "mobile" : null]);
  }

  let role;
  if (fw && META_FRAMEWORKS.has(fw[0])) role = "fullstack";
  else if (fw && (fw[0] === "expo" || fw[0] === "react-native")) role = "mobile";
  else if (has("electron")) role = "desktop";
  else if (framework && backend) role = "fullstack";
  else if (framework) role = "frontend";
  else if (backend) role = "backend";
  else if (other.some(([, r]) => r)) role = other.find(([, r]) => r)[1];
  else if (rel === "." && pkg && !Object.keys(deps).length && !other.length) role = "root"; // scripts only
  else role = "package";

  const lines = [];
  if (framework) lines.push(`- Frontend: ${framework}${has("vite") ? " + Vite" : ""}`);
  if (styling) lines.push(`- Styling: ${styling}`);
  if (backend) lines.push(`- Backend: ${backend}${platform && backend !== platform ? ` on ${platform}` : ""}`);
  else if (platform) lines.push(`- Platform: ${platform}`);
  if (has("electron")) lines.push("- Desktop: Electron");
  for (const [label] of other) lines.push(`- ${label}`);
  const db = ["prisma", "drizzle-orm", "mongoose", "pg", "mysql2", "better-sqlite3", "firebase", "firebase-admin", "@supabase/supabase-js", "typeorm", "sequelize"].filter(has);
  if (db.length) lines.push(`- Data: ${db.join(", ")}`);
  const tests = ["vitest", "jest", "@playwright/test", "cypress", "mocha"].filter(has);
  if (tests.length) lines.push(`- Tests: ${tests.join(", ")}`);

  return {
    path: rel,
    name: pkg?.name ?? (rel === "." ? basename(dir) : basename(rel)),
    kind: pkg ? "js" : other.length ? other[0][0].split(/[ /]/)[0].toLowerCase() : "other",
    role,
    framework,
    tailwind,
    styling,
    backend,
    commands: {
      dev: script("dev", "start", "serve"),
      build: script("build"),
      test: script("test"),
      lint: script("lint"),
      typecheck: script("typecheck", "type-check", "check-types", "tsc"),
    },
    has,
    lines,
  };
}

/** Rows for the Commands table: the root's scripts, then each package's (labelled with its folder). */
function commandRows(root, subs) {
  const LABELS = [["dev", "Run in development"], ["build", "Build"], ["test", "Tests"], ["lint", "Lint"], ["typecheck", "Type check"]];
  const rows = [];
  for (const p of [root, ...subs].filter(Boolean)) {
    const where = subs.length && p.path !== "." ? ` (\`${p.path}/\`)` : "";
    for (const [k, label] of LABELS) if (p.commands[k]) rows.push([`${label}${where}`, p.commands[k]]);
  }
  return rows;
}

function isWorkspace(pkg) {
  return Array.isArray(pkg?.workspaces) || !!pkg?.workspaces?.packages;
}

/** The command prefix for package scripts, from the lockfile. */
function packageRunner(dir) {
  if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) return "bun run";
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  return "npm run";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function safeEntries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Markdown docs that exist: root *.md (except the agent files) and docs/*.md. */
export function listDocs(dir) {
  const out = [];
  const skip = new Set(["AGENTS.md", "CLAUDE.md", "GEMINI.md", "CHANGELOG.md", "LICENSE.md", "CODE_OF_CONDUCT.md"]);
  for (const f of safeList(dir)) if (f.endsWith(".md") && !skip.has(f)) out.push(f);
  for (const f of safeList(join(dir, "docs"))) if (f.endsWith(".md")) out.push(`docs/${f}`);
  return out.sort();
}

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
