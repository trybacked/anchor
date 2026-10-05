import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createAuditLogHook } from "../../src/audit-log.js";
import { runWithRequestContext } from "../../src/request-context.js";
describe("createAuditLogHook", () => {
  it("writes JSON lines to a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "anchor-audit-"));
    const logPath = join(dir, "nested", "audit.jsonl");
    const hook = createAuditLogHook({ logPath, mirrorStderr: false });
    hook({ operation: "objectQuery", durationMs: 12, objectId: "contract" });
    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}") as {
      type: string;
      operation: string;
    };
    expect(parsed.type).toBe("anchor_audit");
    expect(parsed.operation).toBe("objectQuery");
    rmSync(dir, { recursive: true, force: true });
  });
  it("adds gateway user from request context", () => {
    const dir = mkdtempSync(join(tmpdir(), "anchor-audit-user-"));
    const logPath = join(dir, "audit.jsonl");
    const hook = createAuditLogHook({ logPath, mirrorStderr: false });
    runWithRequestContext({ user: "demo" }, () => {
      hook({ operation: "objectQuery", durationMs: 3, objectId: "contract" });
    });
    const parsed = JSON.parse(readFileSync(logPath, "utf8").trim()) as {
      user?: string;
    };
    expect(parsed.user).toBe("demo");
    rmSync(dir, { recursive: true, force: true });
  });
});
