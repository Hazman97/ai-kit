import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Work out what a project is made of, from its files only (nothing is run).
 * Returns the facts the templates need: name, stack lines, commands, frontend details.
 */
export function detect(dir) {
  const pkg = readJson(join(dir, "package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const has = (name) => name in deps;
  const major = (name) => {
    const v = String(deps[name] ?? "").match(/\d+/);
    return v ? Number(v[0]) : null;
  };

  const runner = packageRunner(dir);
  const scripts = pkg?.scripts ?? {};
  const script = (...names) => {
    const n = names.find((x) => x in scripts);
    return n ? `${runner} ${n}` : null;
  };

  // frontend framework (most specific first)
  const framework =
    (has("next") && `Next.js ${major("next") ?? ""}`) ||
    (has("nuxt") && `Nuxt ${major("nuxt") ?? ""}`) ||
    (has("@sveltejs/kit") && "SvelteKit") ||
    (has("astro") && "Astro") ||
    (has("@angular/core") && `Angular ${major("@angular/core") ?? ""}`) ||
    (has("vue") && `Vue ${major("vue") ?? ""}`) ||
    (has("react") && `React ${major("react") ?? ""}`) ||
    (has("svelte") && "Svelte") ||
    (has("solid-js") && "SolidJS") ||
    null;

  const tailwind = has("tailwindcss") || has("@tailwindcss/vite") || has("@tailwindcss/postcss") ? (major("tailwindcss") ?? (has("@tailwindcss/vite") || has("@tailwindcss/postcss") ? 4 : null)) : null;
  const styling = tailwind ? `Tailwind CSS v${tailwind}` : has("sass") ? "Sass" : has("styled-components") ? "styled-components" : null;

  const backend =
    (has("hono") && "Hono") ||
    (has("@nestjs/core") && "NestJS") ||
    (has("fastify") && "Fastify") ||
    (has("express") && "Express") ||
    (has("koa") && "Koa") ||
    null;

  const stack = [];
  if (pkg) {
    stack.push(`- Runtime: ${runner === "bun run" ? "Bun" : "Node.js"}${has("typescript") ? " + TypeScript" : ""} (package manager: ${runner.split(" ")[0]})`);
    if (framework) stack.push(`- Frontend: ${framework.trim()}${has("vite") ? " + Vite" : ""}`);
    if (styling) stack.push(`- Styling: ${styling}`);
    if (backend) stack.push(`- Backend: ${backend}`);
    const db = ["prisma", "drizzle-orm", "mongoose", "pg", "mysql2", "better-sqlite3", "firebase", "firebase-admin", "@supabase/supabase-js"].filter(has);
    if (db.length) stack.push(`- Data: ${db.join(", ")}`);
    const tests = ["vitest", "jest", "@playwright/test", "cypress", "mocha"].filter(has);
    if (tests.length) stack.push(`- Tests: ${tests.join(", ")}`);
    if (Array.isArray(pkg.workspaces) || pkg.workspaces?.packages) stack.push("- Monorepo: workspaces in package.json");
  }
  for (const [file, label] of [
    ["pyproject.toml", "Python (pyproject.toml)"],
    ["requirements.txt", "Python (requirements.txt)"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["composer.json", "PHP (composer)"],
    ["Gemfile", "Ruby"],
    ["pubspec.yaml", "Flutter / Dart"],
  ]) {
    if (existsSync(join(dir, file))) stack.push(`- ${label}`);
  }
  if (existsSync(join(dir, "Dockerfile")) || existsSync(join(dir, "docker-compose.yml")) || existsSync(join(dir, "compose.yaml"))) stack.push("- Docker files present");
  if (!stack.length) stack.push("- _Not detected: fill in by hand or with `.ai/prompts/project-setup.md`._");

  const commands = {
    dev: script("dev", "start", "serve"),
    build: script("build"),
    test: script("test"),
    lint: script("lint"),
    typecheck: script("typecheck", "type-check", "check-types", "tsc"),
  };

  return {
    name: pkg?.name || basename(dir),
    hasPackage: !!pkg,
    framework: framework?.trim() ?? null,
    tailwind,
    styling,
    frontend: !!framework,
    stack,
    commands,
  };
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
