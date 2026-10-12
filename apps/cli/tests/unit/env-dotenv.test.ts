import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { dotEnvLoadOrder, dotEnvPathsFromCwd, resolveAnchorMonorepoRoot } from "../../src/env.js";

describe("dotEnvPathsFromCwd", () => {
  it("includes anchor/.env when cwd is under anchor/apps/cli", () => {
    const paths = dotEnvPathsFromCwd(import.meta.dirname);
    expect(paths.some((path) => path.endsWith("/anchor/.env"))).toBe(true);
  });
});

describe("resolveAnchorMonorepoRoot", () => {
  it("points at the anchor package root", () => {
    const root = resolveAnchorMonorepoRoot();
    expect(root).not.toBeNull();
    expect(join(root!, "apps", "cli", "package.json")).toMatch(/apps\/cli\/package\.json$/);
  });
});

describe("dotEnvLoadOrder", () => {
  it("lists anchor/.env before tenant cwd when cwd is outside anchor tree", () => {
    const backedRoot = resolveAnchorMonorepoRoot();
    expect(backedRoot).not.toBeNull();
    const chiediDir = join(dirname(backedRoot!), "chiedi");
    const order = dotEnvLoadOrder(chiediDir);
    const anchorEnv = join(backedRoot!, ".env");
    if (order.includes(anchorEnv)) {
      expect(order.indexOf(anchorEnv)).toBe(0);
    }
  });
});
