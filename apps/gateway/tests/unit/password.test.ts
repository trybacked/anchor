import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/password.js";

describe("password", () => {
  it("hashes and verifies", () => {
    const encoded = hashPassword("secret-pass");
    expect(encoded.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("secret-pass", encoded)).toBe(true);
    expect(verifyPassword("wrong", encoded)).toBe(false);
  });
});
