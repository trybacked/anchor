#!/usr/bin/env node
/**
 * Fail fast before `changeset publish` when CI/local is not authenticated to npm.
 * The Release workflow sets NODE_AUTH_TOKEN from secrets.NPM_TOKEN (see publish-npm.yml).
 */
const token = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;

if (!token?.trim()) {
  console.error(
    [
      "Cannot publish @trybacked/*: npm registry auth is missing.",
      "",
      "CI: add repository secret NPM_TOKEN (npm automation token with publish access to @trybacked).",
      "Local: npm login or export NODE_AUTH_TOKEN before pnpm release.",
      "",
      "See .changeset/README.md — Release to npm.",
    ].join("\n"),
  );
  process.exit(1);
}
