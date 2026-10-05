import { describe, expect, it } from "vitest";
import {
  isServiceErrorResult,
  serviceError,
  serviceErrorHttpStatus,
} from "../../src/service-error.js";
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
});
