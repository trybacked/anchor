import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const derived = scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_r),
    String(SCRYPT_p),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export function verifyPassword(plain: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const expected = Buffer.from(parts[5] ?? "", "base64url");
  if (!Number.isFinite(n) || salt.length === 0 || expected.length === 0) {
    return false;
  }
  const derived = scryptSync(plain, salt, expected.length, { N: n, r, p });
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
