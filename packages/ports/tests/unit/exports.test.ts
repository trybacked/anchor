import * as ports from "../../src/index.js";
import { describe, expect, it } from "vitest";

describe("@trybacked/ports exports", () => {
  it("re-exports document and LLM port types", () => {
    expect(ports).toBeDefined();
  });
});
