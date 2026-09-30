#!/usr/bin/env node
// Minimal self-managed git-hooks installer (DIY Husky replacement).
//
// Installs ONLY pre-commit and pre-push into the repo's real git hooks dir
// (normally .git/hooks). It deliberately:
//   - never touches commit-msg (left free for `git review -s` / Gerrit)
//   - never sets core.hooksPath (so Git + git-review keep using .git/hooks)
//   - defensively unsets a stale husky-style core.hooksPath to self-heal old clones
//
// Runs from the `prepare` script on every `pnpm install`. Idempotent.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANAGED_MARKER = "nectar-survey managed hook";
const HOOKS = ["pre-commit", "pre-push"]; // never "commit-msg"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "scripts", "hooks");

function log(msg) {
  console.log(`install-git-hooks: ${msg}`);
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function gitSafe(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

// 1. Skip when there is no git repo (registry install, CI checkout of a tarball,
//    `pnpm install` inside node_modules of a consumer, etc.). Husky-equivalent guard.
const insideRepo = gitSafe(["rev-parse", "--is-inside-work-tree"]) === "true";
if (!insideRepo) {
  log("not inside a git work tree; skipping hook install.");
  process.exit(0);
}

// Optional explicit opt-out, mirroring Husky's HUSKY=0.
if (process.env.ARDC_HOOKS === "0" || process.env.CI === "true") {
  log("ARDC_HOOKS=0 or CI=true; skipping hook install.");
  process.exit(0);
}

// 2. Self-heal: unset a stale husky-style core.hooksPath so Git + git-review
//    fall back to .git/hooks. Only unset if it points at a .husky path, so we
//    never clobber an intentional custom hooksPath someone set on purpose.
const currentHooksPath = gitSafe([
  "config",
  "--local",
  "--get",
  "core.hooksPath",
]);
if (currentHooksPath && /(^|[\\/])\.husky([\\/]|$)/.test(currentHooksPath)) {
  gitSafe(["config", "--local", "--unset", "core.hooksPath"]);
  log(`unset stale husky core.hooksPath (was "${currentHooksPath}").`);
}

// 3. Resolve the REAL hooks directory (honours worktrees / custom git dirs).
//    `git rev-parse --git-path hooks` returns the correct hooks dir for the
//    current work tree even in linked worktrees. If a (non-husky) core.hooksPath
//    is intentionally set, --git-path still reports .git/hooks, so we install
//    there; we never create or write a custom hooksPath ourselves.
const hooksDirRaw = git(["rev-parse", "--git-path", "hooks"]);
const hooksDir = resolve(repoRoot, hooksDirRaw);
if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true });
}

// 4. Install each managed hook. Overwrite our own managed versions; warn (but do
//    not clobber) if a foreign, non-managed hook already occupies the slot.
for (const name of HOOKS) {
  const src = join(sourceDir, name);
  const dest = join(hooksDir, name);

  if (!existsSync(src)) {
    log(`WARNING: source hook missing: ${src}; skipping.`);
    continue;
  }

  if (existsSync(dest)) {
    const existing = readFileSync(dest, "utf8");
    if (!existing.includes(MANAGED_MARKER)) {
      log(
        `WARNING: ${name} already exists and is NOT nectar-survey-managed; ` +
          `leaving it untouched. Remove it manually if you want managed hooks.`,
      );
      continue;
    }
  }

  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  log(`installed ${name}.`);
}

// 5. commit-msg is intentionally never written here; it is reserved for
//    `git review -s` (Gerrit Change-Id hook).
log("done. commit-msg left untouched for `git review -s`.");
