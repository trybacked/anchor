import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findFalconProjectRoot,
  looksLikeBackedFalconCliHelp,
  resolveFalconLaunch,
} from "../../src/falcon/resolve.js";

const PYPROJECT = `[project]
name = "falcon"
version = "0.1.0"
`;

describe("findFalconProjectRoot", () => {
  it("finds sibling falcon/ under a monorepo root", () => {
    const root = mkdtempSync(join(tmpdir(), "backed-mono-"));
    mkdirSync(join(root, "falcon"), { recursive: true });
    writeFileSync(join(root, "falcon", "pyproject.toml"), PYPROJECT);
    expect(findFalconProjectRoot(join(root, "anchor", "apps", "cli"))).toBe(join(root, "falcon"));
  });
});

describe("looksLikeBackedFalconCliHelp", () => {
  it("accepts Backed Falcon argparse help", () => {
    const sample = "Local UI shadowing: record → ingest → analyze → distill → report.";
    expect(looksLikeBackedFalconCliHelp(sample)).toBe(true);
  });

  it("rejects empty or unrelated binaries", () => {
    expect(looksLikeBackedFalconCliHelp("")).toBe(false);
    expect(looksLikeBackedFalconCliHelp("Falcon game launcher")).toBe(false);
  });
});

describe("resolveFalconLaunch", () => {
  it("prefers FALCON_BIN over discovery", () => {
    const launch = resolveFalconLaunch({ FALCON_BIN: "/opt/falcon/bin/falcon" }, "/tmp/nowhere");
    expect(launch).toEqual({ command: "/opt/falcon/bin/falcon", args: [] });
  });

  it("prefers monorepo falcon/ over a homonym on PATH", () => {
    const root = mkdtempSync(join(tmpdir(), "backed-mono-"));
    mkdirSync(join(root, "falcon"), { recursive: true });
    writeFileSync(join(root, "falcon", "pyproject.toml"), PYPROJECT);
    const launch = resolveFalconLaunch(process.env, join(root, "tenant-app"));
    expect(launch.args).toContain("falcon");
    expect(launch.command.endsWith("uv") || launch.args[0] === "-m").toBe(true);
  });
});
