import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "../../src/filters.js";

describe("escapeLikePattern", () => {
  it("escapes % and _", () => {
    expect(escapeLikePattern("100%_done")).toBe("100\\%\\_done");
  });
});
