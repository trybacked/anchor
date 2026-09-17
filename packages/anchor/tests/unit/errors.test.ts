import { describe, expect, it } from "vitest";
import { AnchorClientError, assertApiSuccess, parseApiError } from "../../src/errors.js";

describe("parseApiError", () => {
  it("parses valid API error bodies", () => {
    expect(parseApiError({ error: "unauthorized", message: "Missing token" })).toEqual({
      error: "unauthorized",
      message: "Missing token",
    });
  });

  it("returns undefined for invalid shapes", () => {
    expect(parseApiError(null)).toBeUndefined();
    expect(parseApiError({ message: "no code" })).toBeUndefined();
    expect(parseApiError("bad")).toBeUndefined();
  });
});

describe("assertApiSuccess", () => {
  it("throws when openapi-fetch returns an unparseable error", () => {
    expect(() =>
      assertApiSuccess(undefined, { bad: true }, new Response(null, { status: 500 })),
    ).toThrow(AnchorClientError);
  });

  it("throws when the response body is empty", () => {
    expect(() =>
      assertApiSuccess(undefined, undefined, new Response(null, { status: 200 })),
    ).toThrow(AnchorClientError);
  });
});

describe("AnchorClientError.fromResponse", () => {
  it("handles non-JSON error bodies", async () => {
    const error = await AnchorClientError.fromResponse(
      new Response("upstream unavailable", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
      "Gateway failure",
    );

    expect(error).toMatchObject({
      name: "AnchorClientError",
      message: "Gateway failure",
      status: 502,
    });
    expect(error.body).toBeUndefined();
  });
});
