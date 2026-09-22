import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";
import { createTempWorkspace, removeTempWorkspace } from "../helpers/temp-workspace.js";

describe("headless CLI", () => {
  let tempWorkspace: string | undefined;

  afterEach(async () => {
    await removeTempWorkspace(tempWorkspace);
    tempWorkspace = undefined;
  });

  it("version prints semver", async () => {
    tempWorkspace = await createTempWorkspace("backed-headless-version-");
    const result = await runCli(["version"], tempWorkspace);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^backed \d+\.\d+\.\d+/);
  });

  it("init completes without a TTY", async () => {
    tempWorkspace = await createTempWorkspace("backed-headless-init-");
    const result = await runCli(["anchor", "init"], tempWorkspace);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Workspace initialized");
  });
});
