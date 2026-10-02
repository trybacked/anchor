#!/usr/bin/env node
/**
 * Fail fast before `changeset publish` when CI/local is not authenticated to npm.
 * CI: NODE_AUTH_TOKEN / NPM_TOKEN (see publish-npm.yml).
 * Local: same env vars, or an existing `npm login` session (~/.npmrc).
 */
import { spawnSync } from "node:child_process";

const token = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;

function hasNpmLoginSession() {
  const result = spawnSync("npm", ["whoami", "--registry", "https://registry.npmjs.org"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 && (result.stdout?.trim().length ?? 0) > 0;
}

if (token?.trim()) {
  process.exit(0);
}

if (hasNpmLoginSession()) {
  process.exit(0);
}

console.error(
  [
    "Cannot publish @trybacked/*: npm registry auth is missing.",
    "",
    "CI: add repository secret NPM_TOKEN on github.com/trybacked/anchor (Settings → Secrets → Actions).",
    "     Use an npm automation token with publish access to the @trybacked scope, then re-run the Release workflow.",
    "Local: run `npm login` (not only `pnpm login`), or export NODE_AUTH_TOKEN before pnpm release.",
    "",
    "See .changeset/README.md — Release to npm.",
  ].join("\n"),
);
process.exit(1);
