#!/usr/bin/env node
const port = process.env["ANCHOR_API_PORT"] ?? process.env["PORT"] ?? "8787";
const url = `http://127.0.0.1:${port}/health/live`;

try {
  const response = await fetch(url);
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
