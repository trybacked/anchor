#!/usr/bin/env node
import { randomBytes, scryptSync } from "node:crypto";
const plain = process.argv[2];
if (plain === undefined || plain.length === 0) {
  console.error("Usage: pnpm hash-password <password>");
  process.exit(1);
}
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;
const salt = randomBytes(16);
const derived = scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
const encoded = [
  "scrypt",
  String(SCRYPT_N),
  String(SCRYPT_r),
  String(SCRYPT_p),
  salt.toString("base64url"),
  derived.toString("base64url"),
].join("$");
console.log(encoded);
