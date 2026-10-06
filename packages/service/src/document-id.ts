import { createHash } from "node:crypto";

export function canonicalVolumePathForDocumentId(path: string): string {
  const trimmed = path.trim();
  const withoutDbfs = trimmed.startsWith("dbfs:") ? trimmed.slice("dbfs:".length) : trimmed;
  return withoutDbfs.startsWith("/") ? withoutDbfs : `/${withoutDbfs}`;
}

export function documentIdFromVolumePath(volumePath: string): string {
  return createHash("sha256")
    .update(canonicalVolumePathForDocumentId(volumePath), "utf8")
    .digest("hex");
}
