#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BACKED_S3_BUCKET,
  DEFAULT_BACKED_S3_REGION,
} from "../packages/core/dist/index.js";

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../packages/infrastructure/package.json"),
);
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

function loadEnv(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

function walkFiles(dir, base, out) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, base, out);
      continue;
    }
    if (st.isFile()) {
      out.push({ full, key: relative(base, full).replace(/\\/g, "/") });
    }
  }
}

async function main() {
  const tenantId = process.argv[2];
  const localRoot = process.argv[3];
  if (!tenantId || !localRoot) {
    console.error("Usage: sync-tenant-sources-to-s3.mjs <tenantId> <localSourcesRoot>");
    process.exitCode = 1;
    return;
  }
  loadEnv(join(process.env.HOME ?? "", ".config", "backed", `${tenantId}.env`));
  const bucket = process.env.BACKED_S3_BUCKET?.trim() ?? DEFAULT_BACKED_S3_BUCKET;
  const region = process.env.BACKED_S3_REGION?.trim() ?? DEFAULT_BACKED_S3_REGION;
  const client = new S3Client({ region });
  const files = [];
  walkFiles(localRoot, localRoot, files);
  if (files.length === 0) {
    console.error(`No files under ${localRoot}`);
    process.exitCode = 1;
    return;
  }
  for (const file of files) {
    const key = `${tenantId}/${file.key}`;
    const body = readFileSync(file.full);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
      }),
    );
    console.error(`uploaded s3://${bucket}/${key} (${body.byteLength} bytes)`);
  }
  console.error(`Done: ${files.length} object(s) → s3://${bucket}/${tenantId}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
