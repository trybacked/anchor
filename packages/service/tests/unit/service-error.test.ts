import { ObjectQuerySchema, type QueryIssue } from "@trybacked/compiler";
import { describe, expect, it } from "vitest";
import {
  isServiceErrorResult,
  serviceError,
  serviceErrorHttpStatus,
} from "../../src/service-error.js";
import { zodIssuesToQueryIssues } from "../../src/query-issues.js";
describe("serviceError", () => {
  it("maps codes to HTTP status", () => {
    expect(serviceErrorHttpStatus("not_found")).toBe(404);
    expect(serviceErrorHttpStatus("unavailable")).toBe(503);
    expect(serviceErrorHttpStatus("bad_request")).toBe(400);
  });
  it("recognizes structured error results", () => {
    const result = serviceError("unavailable", "offline");
    expect(isServiceErrorResult(result)).toBe(true);
    expect(result.error.message).toBe("offline");
    expect(isServiceErrorResult({ error: "legacy" })).toBe(false);
  });
  it("carries and validates query issues", () => {
    const issue: QueryIssue = { code: "unknown_property", message: "nope", path: "propertyId" };
    const result = serviceError("bad_request", "bad", [issue]);
    expect(isServiceErrorResult(result)).toBe(true);
    expect(result.error.issues).toEqual([issue]);
    expect(
      isServiceErrorResult({ error: { code: "bad_request", message: "x", issues: [{}] } }),
    ).toBe(false);
  });
});
describe("zodIssuesToQueryIssues", () => {
  it("converts Zod issues into invalid_query issues with bracketed paths", () => {
    const parsed = ObjectQuerySchema.safeParse({
      objectId: "contract",
      filters: [{ op: "eq" }],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issues = zodIssuesToQueryIssues(parsed.error);
    expect(issues[0]).toMatchObject({
      code: "invalid_query",
      path: "filters[0].propertyId",
      message: expect.any(String),
    });
  });
});
