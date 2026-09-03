import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  initWorkspace,
  listRunIds,
  readRunArtifact,
  readWorkspaceConfig,
  writeRunArtifact,
} from "./artifacts.js";
import { createRunId, workspacePaths } from "./workspace.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "backed-core-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("workspace config", () => {
  it("writes and reads .backed/config.yaml", () => {
    initWorkspace(root, { sourcesDir: "./sorgenti" });
    expect(readWorkspaceConfig(root)).toEqual({ sourcesDir: "./sorgenti" });
  });

  it("fails with an actionable Italian message when not initialized", () => {
    expect(() => readWorkspaceConfig(root)).toThrow(/backed init/);
  });
});

describe("run artifacts", () => {
  const PayloadSchema = z.object({ value: z.number() });

  it("writes and reads a validated artifact", () => {
    writeRunArtifact(root, "run-1", "profile", { value: 42 });
    expect(readRunArtifact(root, "run-1", "profile", PayloadSchema)).toEqual({ value: 42 });
  });

  it("rejects artifacts that violate the schema", () => {
    writeRunArtifact(root, "run-1", "profile", { value: "not a number" });
    expect(() => readRunArtifact(root, "run-1", "profile", PayloadSchema)).toThrow();
  });

  it("lists run ids in chronological order", () => {
    writeRunArtifact(root, "20260903T120000-bbbb", "profile", {});
    writeRunArtifact(root, "20260901T090000-aaaa", "profile", {});
    expect(listRunIds(root)).toEqual(["20260901T090000-aaaa", "20260903T120000-bbbb"]);
  });
});

describe("createRunId", () => {
  it("is timestamp-prefixed and lexicographically sortable", () => {
    const earlier = createRunId(new Date("2026-09-01T09:00:00.000Z"));
    const later = createRunId(new Date("2026-09-03T12:00:00.000Z"));
    expect(earlier.startsWith("20260901T090000-")).toBe(true);
    expect(earlier < later).toBe(true);
  });
});

describe("workspacePaths", () => {
  it("builds artifact paths under .backed/runs/<runId>/", () => {
    const paths = workspacePaths(root);
    expect(paths.artifactPath("run-1", "proposal")).toBe(
      path.join(root, ".backed", "runs", "run-1", "proposal.json"),
    );
    expect(paths.modelPath).toBe(path.join(root, "modello.yaml"));
  });
});
