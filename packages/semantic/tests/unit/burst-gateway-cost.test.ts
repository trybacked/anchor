import { describe, expect, it } from "vitest";
import { extractGatewayCostUsd } from "../../src/burst.js";

describe("extractGatewayCostUsd", () => {
  it("returns null for non-object metadata", () => {
    expect(extractGatewayCostUsd(null)).toBeNull();
    expect(extractGatewayCostUsd("cost")).toBeNull();
  });

  it("parses numeric and string gateway costs", () => {
    expect(
      extractGatewayCostUsd({
        gateway: { cost: 0.0123 },
      }),
    ).toBe(0.0123);
    expect(
      extractGatewayCostUsd({
        gateway: { cost: "0.045" },
      }),
    ).toBe(0.045);
  });

  it("returns null when gateway cost is missing or invalid", () => {
    expect(extractGatewayCostUsd({ gateway: {} })).toBeNull();
    expect(extractGatewayCostUsd({ gateway: { cost: "not-a-number" } })).toBeNull();
    expect(extractGatewayCostUsd({ gateway: { cost: Number.NaN } })).toBeNull();
  });
});
