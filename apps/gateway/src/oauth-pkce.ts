import { createHash, timingSafeEqual } from "node:crypto";
export function verifyPkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean {
  if (method !== "S256") {
    return false;
  }
  const digest = createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
  if (digest.length !== codeChallenge.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(digest), Buffer.from(codeChallenge));
}
export function isValidCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}
