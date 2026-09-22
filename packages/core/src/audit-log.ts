import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AuditLogSchema, EMPTY_AUDIT_LOG, mergeAuditLogs } from "./ontology/audit.js";
import type { AuditEvent, AuditLog } from "./ontology/audit.js";
import { BACKED_DIR_NAME } from "./workspace.js";

export const AUDIT_LOG_FILE_NAME = "audit.json";
export const PUBLICATION_FILE_NAME = "publication.json";

export function auditLogPath(root: string): string {
  return path.join(root, BACKED_DIR_NAME, AUDIT_LOG_FILE_NAME);
}

export function publicationPath(root: string): string {
  return path.join(root, BACKED_DIR_NAME, PUBLICATION_FILE_NAME);
}

export function readAuditLog(root: string): AuditLog {
  const filePath = auditLogPath(root);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return AuditLogSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY_AUDIT_LOG;
  }
}

export function appendAuditEvents(root: string, events: AuditEvent[]): AuditLog {
  if (events.length === 0) {
    return readAuditLog(root);
  }
  const merged = mergeAuditLogs(readAuditLog(root), { version: 1, events });
  const filePath = auditLogPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  return merged;
}
