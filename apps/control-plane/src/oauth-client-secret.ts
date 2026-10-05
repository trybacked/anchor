import { createHash, randomBytes } from "node:crypto";
export function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}
export function hashClientSecret(secret: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${secret}`, "utf8").digest("hex");
}
export function verifyClientSecret(secret: string, pepper: string, expectedHash: string): boolean {
  const actual = hashClientSecret(secret, pepper);
  return actual.length === expectedHash.length && timingSafeEqual(actual, expectedHash);
}
function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
