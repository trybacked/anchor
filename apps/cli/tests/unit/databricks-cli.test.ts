import { describe, expect, it } from "vitest";
import { parseDatabricksAuthTokenOutput } from "../../src/tenant/databricks-cli.js";

describe("parseDatabricksAuthTokenOutput", () => {
  it("returns plain token when CLI prints a single line", () => {
    expect(parseDatabricksAuthTokenOutput("dapi123abc\n")).toBe("dapi123abc");
  });

  it("extracts access_token from JSON output", () => {
    const json = JSON.stringify({
      access_token: "eyJ.test",
      token_type: "Bearer",
      expires_in: 3600,
    });
    expect(parseDatabricksAuthTokenOutput(json)).toBe("eyJ.test");
  });

  it("throws when JSON has no access_token", () => {
    expect(() => parseDatabricksAuthTokenOutput('{"token_type":"Bearer"}')).toThrow(
      /access_token/,
    );
  });
});
