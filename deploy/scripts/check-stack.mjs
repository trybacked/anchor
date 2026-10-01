#!/usr/bin/env node
/**
 * Preflight for anchor/deploy docker compose — no dependencies beyond Node 22.
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const deployDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromCore = createRequire(join(deployDir, "../packages/core/package.json"));
const { parse: parseYaml } = requireFromCore("yaml");

const PLACEHOLDER = /change-me|generate-with-openssl|must-match|dapi\*{2,3}|REPLACE_/i;

function fail(message) {
  console.error(`deploy:check ✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`deploy:check ✓ ${message}`);
}

function parseEnvFile(path) {
  const map = new Map();
  if (!existsSync(path)) {
    return map;
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    map.set(key, value);
  }
  return map;
}

function parseRegistryTenantIds(registryPath) {
  const raw = readFileSync(registryPath, "utf8");
  const doc = parseYaml(raw);
  const tenants = doc?.tenants;
  if (typeof tenants !== "object" || tenants === null) {
    return [];
  }
  return Object.keys(tenants);
}

function parseUserTenants(usersPath) {
  const raw = readFileSync(usersPath, "utf8");
  const tenants = new Set();
  for (const match of raw.matchAll(/^\s+-\s+([a-z0-9_-]+)\s*$/gm)) {
    tenants.add(match[1] ?? "");
  }
  return [...tenants].filter((t) => t.length > 0);
}

function main() {
  const composePath = join(deployDir, "docker-compose.yml");
  if (!existsSync(composePath)) {
    fail(`Missing ${composePath}`);
  }
  const composeText = readFileSync(composePath, "utf8");
  if (!composeText.includes("platform-api:")) {
    fail("docker-compose.yml must define platform-api service");
  }
  if (!composeText.includes("control-plane:")) {
    fail("docker-compose.yml must define control-plane service");
  }
  if (!composeText.includes("GATEWAY_PLATFORM_UPSTREAM")) {
    fail("docker-compose.yml must use GATEWAY_PLATFORM_UPSTREAM");
  }
  ok("compose platform layout OK");

  const gatewayEnvPath = join(deployDir, ".env");
  if (!existsSync(gatewayEnvPath)) {
    fail("Missing deploy/.env — copy from .env.example");
  }
  const env = parseEnvFile(gatewayEnvPath);

  const sessionSecret = env.get("GATEWAY_SESSION_SECRET") ?? "";
  if (sessionSecret.length < 32) {
    fail("GATEWAY_SESSION_SECRET must be at least 32 characters in deploy/.env");
  }
  ok("gateway session secret length OK");

  for (const key of [
    "BACKED_DATABRICKS_HOST",
    "BACKED_DATABRICKS_TOKEN",
    "BACKED_DATABRICKS_WAREHOUSE_ID",
    "ANCHOR_API_TOKEN",
    "GATEWAY_PLATFORM_TOKEN",
  ]) {
    const value = env.get(key) ?? "";
    if (value.length === 0) {
      fail(`deploy/.env: ${key} is empty`);
    }
    if (PLACEHOLDER.test(value)) {
      fail(`deploy/.env: ${key} still looks like a placeholder`);
    }
  }

  const anchorToken = env.get("ANCHOR_API_TOKEN") ?? "";
  const platformToken = env.get("GATEWAY_PLATFORM_TOKEN") ?? "";
  if (anchorToken !== platformToken) {
    fail("GATEWAY_PLATFORM_TOKEN must equal ANCHOR_API_TOKEN in deploy/.env");
  }
  ok("platform token parity OK");

  const registrySource = (env.get("BACKED_REGISTRY_SOURCE") ?? "file").trim().toLowerCase();
  const authMode = (env.get("GATEWAY_AUTH_MODE") ?? "file").trim().toLowerCase();

  if (registrySource === "http") {
    for (const key of [
      "CONTROL_PLANE_ADMIN_TOKEN",
      "CONTROL_PLANE_INTERNAL_TOKEN",
      "POSTGRES_PASSWORD",
    ]) {
      const value = env.get(key) ?? "";
      if (value.length < 16) {
        fail(`deploy/.env: ${key} must be at least 16 characters when BACKED_REGISTRY_SOURCE=http`);
      }
    }
    ok("control plane tokens OK (http registry)");
  }

  if (authMode === "workos") {
    for (const key of ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_REDIRECT_URI"]) {
      const value = env.get(key) ?? "";
      if (value.length === 0) {
        fail(`deploy/.env: ${key} required when GATEWAY_AUTH_MODE=workos`);
      }
    }
    ok("WorkOS gateway auth config OK");
  }

  const registryHost =
    process.env.TENANTS_REGISTRY_HOST ?? resolve(deployDir, "../../tenants.yaml");
  if (!existsSync(registryHost)) {
    fail(`Missing tenants registry at ${registryHost}`);
  }
  const registryTenants = parseRegistryTenantIds(registryHost);
  ok(`tenants registry (${registryTenants.join(", ")})`);

  if (authMode !== "workos") {
    const usersPath = join(deployDir, "users.yaml");
    if (!existsSync(usersPath)) {
      fail("Missing users.yaml — copy from users.yaml.example");
    }
    const userTenants = parseUserTenants(usersPath);
    const tenantRefSource = registrySource === "http" ? registryTenants : registryTenants;
    for (const tenantId of userTenants) {
      if (registrySource !== "http" && !tenantRefSource.includes(tenantId)) {
        fail(`users.yaml references unknown tenant "${tenantId}"`);
      }
    }
    ok("users.yaml tenant references OK");
  }

  if (process.argv.includes("--remote")) {
    try {
      execSync("backed platform status", {
        cwd: resolve(deployDir, ".."),
        stdio: "inherit",
        encoding: "utf8",
      });
      ok("remote ontology publications (backed platform status)");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`backed platform status failed: ${message}`);
    }
  }

  try {
    execSync("docker compose config", {
      cwd: deployDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    ok("docker compose config valid");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`docker compose config failed: ${message}`);
  }

  console.log("\ndeploy:check — all checks passed. Safe to run docker compose up.");
}

main();
