import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "../../src/session.js";
describe("session", () => {
  const secret = "x".repeat(32);
  it("round-trips user claims", async () => {
    const token = await createSessionToken(secret, { username: "demo", tenants: ["gerace"] }, 3600);
    const user = await verifySessionToken(secret, token);
    expect(user).toEqual({ username: "demo", tenants: ["gerace"] });
  });
  it("rejects tampered token", async () => {
    const token = await createSessionToken(secret, { username: "demo", tenants: [] }, 3600);
    const user = await verifySessionToken("y".repeat(32), token);
    expect(user).toBeUndefined();
  });
});
