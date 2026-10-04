import { createHash } from "node:crypto";

export type AnchorOperationAuditEvent = {
  operation:
    | "objectQuery"
    | "chunkSearch"
    | "entityProfile"
    | "graphTraverse"
    | "semanticAsk"
    | "agentRun";
  objectId?: string | undefined;
  mode?: string | undefined;
  rowCount?: number | undefined;
  durationMs: number;
  sqlHash?: string | undefined;
  principal?: string | undefined;
  user?: string | undefined;
  tenant?: string | undefined;
};

export type AnchorOperationAuditHook = (event: AnchorOperationAuditEvent) => void;

export function hashSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex").slice(0, 16);
}

export function writeAuditJsonLine(event: AnchorOperationAuditEvent): void {
  process.stderr.write(
    `${JSON.stringify({ type: "anchor_audit", ts: new Date().toISOString(), ...event })}\n`,
  );
}
