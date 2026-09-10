#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseModelYaml } from "@backed/core";
import { runTenantPipeline } from "../dist/run-tenant.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const anchorRoot = join(scriptDir, "../../..");
const fixtureDir = join(anchorRoot, "fixtures/gerace-albo/sources");

function loadDotEnv(envPath) {
    try {
        for (const line of readFileSync(envPath, "utf8").split("\n")) {
            const trimmed = line.trim();
            if (trimmed.length === 0 || trimmed.startsWith("#")) {
                continue;
            }
            const separator = trimmed.indexOf("=");
            if (separator === -1) {
                continue;
            }
            const key = trimmed.slice(0, separator).trim();
            const value = trimmed.slice(separator + 1).trim();
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    }
    catch {
        // optional .env
    }
}

function loadGeraceFiles() {
    return readdirSync(fixtureDir)
        .sort()
        .map((fileName) => ({
            fileName,
            content: readFileSync(join(fixtureDir, fileName)),
        }));
}

function buildIncrementalFile() {
    const template = readFileSync(join(fixtureDir, "atto_1124.txt"), "utf8");
    const suffix = `\nPublication number: 9999\nIncremental golden live run\n`;
    return {
        fileName: "atto_9999_live.txt",
        content: Buffer.from(`${template}${suffix}`, "utf8"),
    };
}

function formatMs(ms) {
    if (ms < 1000) {
        return `${String(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatUsage(usage) {
    const cost = usage.costUsd === null ? "n/a" : `$${usage.costUsd.toFixed(4)}`;
    return `in=${String(usage.inputTokens)} out=${String(usage.outputTokens)} cost=${cost}`;
}

function createTimedProgress(runStartedAt) {
    const elapsed = () => formatMs(Date.now() - runStartedAt);
    return {
        heading(message) {
            console.log(`\n[${elapsed()}] ${message}`);
        },
        step(message) {
            console.log(`[${elapsed()}] ▶ ${message}`);
        },
        detail(message) {
            console.log(`[${elapsed()}]   ${message}`);
        },
        success(message) {
            console.log(`[${elapsed()}] ✓ ${message}`);
        },
        warn(message) {
            console.log(`[${elapsed()}] ! ${message}`);
        },
        error(message) {
            console.error(`[${elapsed()}] ✗ ${message}`);
        },
        track(label, completed, total) {
            console.log(`[${elapsed()}]   ${label} ${String(completed)}/${String(total)}`);
        },
        indeterminate(message) {
            console.log(`[${elapsed()}]   ${message}`);
        },
    };
}

function printPhaseSummary(label, startedAt, result) {
    const wallMs = Date.now() - startedAt;
    console.log(`\n── ${label} ──`);
    console.log(`  wall time:     ${formatMs(wallMs)}`);
    console.log(`  skipped:       ${String(result.skipped)}`);
    console.log(`  runId:         ${result.runId}`);
    if (result.skipped) {
        return;
    }
    const stats = result.stats;
    console.log(`  ingest:        ${formatMs(stats.ingestMs)}`);
    console.log(`  documents:     ${formatMs(stats.documentsMs)}`);
    console.log(`  extraction:    ${formatMs(stats.extractionMs)}`);
    console.log(`  embed:         ${formatMs(stats.embedMs)}`);
    console.log(`  profile:       ${formatMs(stats.profileMs)}`);
    console.log(`  proposal:      ${formatMs(stats.proposalMs)}`);
    console.log(`  LLM usage:     ${formatUsage(stats.llmUsage)}`);
    try {
        const model = parseModelYaml(readFileSync(result.modelPath, "utf8"));
        console.log(`  model:         ${String(model.entities.length)} entities, ${String(model.relations.length)} relations`);
    }
    catch {
        console.log("  model:         (unreadable)");
    }
}

async function runPhase(label, options) {
    const startedAt = Date.now();
    console.log(`\n========== ${label} ==========`);
    const result = await runTenantPipeline({
        ...options,
        progress: createTimedProgress(startedAt),
    });
    printPhaseSummary(label, startedAt, result);
    return result;
}

async function main() {
    loadDotEnv(join(anchorRoot, ".env"));
    if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
        console.error("AI_GATEWAY_API_KEY is required. Set it in anchor/.env");
        process.exit(1);
    }

    const skipEmbed = process.argv.includes("--no-embed") || !process.argv.includes("--embed");
    const corpusFiles = loadGeraceFiles();
    const dataRoot = await mkdtemp(join(tmpdir(), "gerace-live-"));
    const tenantId = "gerace-live";
    const sessionStartedAt = Date.now();

    console.log("Gerace live simulation (real LLM, no mocks)");
    console.log(`  fixture:   ${fixtureDir}`);
    console.log(`  files:     ${String(corpusFiles.length)}`);
    console.log(`  dataRoot:  ${dataRoot}`);
    console.log(`  model:     ${process.env.SEMANTIC_MODEL ?? "(default)"}`);
    console.log(`  embed:     ${skipEmbed ? "skipped" : "enabled"}`);

    await runPhase("COLD (forceFull)", {
        dataRoot,
        tenantId,
        files: corpusFiles,
        forceFull: true,
        skipEmbed,
    });

    await runPhase("WARM (all known)", {
        dataRoot,
        tenantId,
        files: corpusFiles,
        skipEmbed,
    });

    await runPhase("INCREMENTAL (+1 file)", {
        dataRoot,
        tenantId,
        files: [...corpusFiles, buildIncrementalFile()],
        skipEmbed,
    });

    console.log(`\nTotal session wall time: ${formatMs(Date.now() - sessionStartedAt)}`);
    console.log(`Persisted under: ${join(dataRoot, "tenants", tenantId, "persist")}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
