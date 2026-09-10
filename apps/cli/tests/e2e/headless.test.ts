import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";
import { createTempWorkspace, removeTempWorkspace } from "../helpers/temp-workspace.js";

describe("headless CLI", () => {
    let tempWorkspace: string | undefined;

    afterEach(async () => {
        await removeTempWorkspace(tempWorkspace);
        tempWorkspace = undefined;
    });

    it("init completes without a TTY", async () => {
        tempWorkspace = await createTempWorkspace("backed-headless-init-");
        const result = await runCli([
            "init",
            "--sources",
            "./sources",
            "--rules",
            '{"documentTypeHints":[]}',
            "-y",
        ], tempWorkspace);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Workspace initialized");
    });

    it("review exits cleanly without a TTY when a proposal exists", async () => {
        tempWorkspace = await createTempWorkspace("backed-headless-review-");
        await runCli([
            "init",
            "--sources",
            "./sources",
            "--rules",
            '{"documentTypeHints":[]}',
            "-y",
        ], tempWorkspace);
        const runDir = join(tempWorkspace, ".backed", "runs", "20260101T120000-test");
        await mkdir(runDir, { recursive: true });
        await writeFile(join(runDir, "proposal.json"), `${JSON.stringify({
            runId: "20260101T120000-test",
            generatedAt: new Date().toISOString(),
            entities: [],
            relations: [],
            rules: [],
            doubts: [],
            questions: [{
                id: "q1",
                kind: "entity",
                targetId: "e1",
                question: "Confirm?",
                impact: 0.5,
                uncertainty: 0.5,
                risk: 0.5,
                evidence: { title: "t", columns: ["a"], rows: [["b"]] },
            }],
        })}\n`, "utf8");
        const result = await runCli(["review"], tempWorkspace, process.env, 10_000);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Review pending");
    });

    it("model does not hang without a TTY", async () => {
        tempWorkspace = await createTempWorkspace("backed-headless-model-");
        const sourcesDir = join(tempWorkspace, "sources");
        await mkdir(sourcesDir, { recursive: true });
        await writeFile(join(sourcesDir, "customers.csv"), "id,name\n1,Acme\n", "utf8");
        await runCli([
            "init",
            "--sources",
            "./sources",
            "--rules",
            '{"documentTypeHints":[]}',
            "-y",
        ], tempWorkspace);
        const result = await runCli(["model", "--no-embed"], tempWorkspace, process.env, 20_000);
        expect(result.exitCode).not.toBeNull();
        expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });
});
