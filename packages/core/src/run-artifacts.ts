import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { z } from "zod";
import { workspacePaths } from "./workspace.js";
import type { RunArtifactName } from "./workspace.js";

const ARTIFACT_JSON_INDENT = 2;

export function writeRunArtifact(root: string, runId: string, artifact: RunArtifactName, data: unknown): string {
    const paths = workspacePaths(root);
    mkdirSync(paths.runDir(runId), { recursive: true });
    const filePath = paths.artifactPath(runId, artifact);
    writeFileSync(filePath, `${JSON.stringify(data, null, ARTIFACT_JSON_INDENT)}\n`, "utf-8");
    return filePath;
}

export function readRunArtifact<TSchema extends z.ZodTypeAny>(
    root: string,
    runId: string,
    artifact: RunArtifactName,
    schema: TSchema,
): z.infer<TSchema> {
    const filePath = workspacePaths(root).artifactPath(runId, artifact);
    let raw: string;
    try {
        raw = readFileSync(filePath, "utf-8");
    }
    catch {
        throw new Error(`Missing artifact: ${filePath}. Run "backed model" first.`);
    }
    return schema.parse(JSON.parse(raw)) as z.infer<TSchema>;
}

export function hasRunArtifact(root: string, runId: string, artifact: RunArtifactName): boolean {
    try {
        readFileSync(workspacePaths(root).artifactPath(runId, artifact), "utf-8");
        return true;
    }
    catch {
        return false;
    }
}

export function listRunIds(root: string): string[] {
    const paths = workspacePaths(root);
    try {
        return readdirSync(paths.runsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }
    catch {
        return [];
    }
}
