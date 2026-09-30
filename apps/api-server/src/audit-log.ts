import {
  writeAuditJsonLine,
  type AnchorOperationAuditEvent,
  type AnchorOperationAuditHook,
} from "@trybacked/service";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AuditLogOptions = {
  logPath?: string | undefined;
  /** When true (default), also emit audit lines to stderr (e.g. docker logs). */
  mirrorStderr?: boolean | undefined;
};

function formatAuditLine(event: AnchorOperationAuditEvent): string {
  return `${JSON.stringify({ type: "anchor_audit", ts: new Date().toISOString(), ...event })}\n`;
}

export function createAuditLogHook(options: AuditLogOptions = {}): AnchorOperationAuditHook {
  const mirrorStderr = options.mirrorStderr !== false;
  if (options.logPath !== undefined) {
    mkdirSync(dirname(options.logPath), { recursive: true });
  }

  return (event) => {
    if (options.logPath !== undefined) {
      appendFileSync(options.logPath, formatAuditLine(event), "utf8");
    }
    if (options.logPath === undefined || mirrorStderr) {
      writeAuditJsonLine(event);
    }
  };
}
