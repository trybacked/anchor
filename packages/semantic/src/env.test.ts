import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "@backed/core";
import { describe, expect, it } from "vitest";

import {
  InvalidReviewThresholdError,
  resolveReviewConfidenceThreshold,
} from "./env.js";

describe("resolveReviewConfidenceThreshold", () => {
  it("defaults to 0.95 when unset", () => {
    expect(resolveReviewConfidenceThreshold({})).toBe(DEFAULT_REVIEW_CONFIDENCE_THRESHOLD);
  });

  it("reads a valid threshold from the environment", () => {
    expect(resolveReviewConfidenceThreshold({ REVIEW_CONFIDENCE_THRESHOLD: "0.8" })).toBe(0.8);
  });

  it("rejects out-of-range values", () => {
    expect(() => resolveReviewConfidenceThreshold({ REVIEW_CONFIDENCE_THRESHOLD: "1.5" })).toThrow(
      InvalidReviewThresholdError,
    );
  });
});
