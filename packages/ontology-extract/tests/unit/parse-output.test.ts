import { describe, expect, it } from "vitest";
import {
  OntologyExtractOutputError,
  parseOntologyExtractOutput,
} from "../../src/extract-output.js";

describe("parseOntologyExtractOutput", () => {
  it("parses fenced JSON", () => {
    const output = parseOntologyExtractOutput(
      '```json\n{"locale":"it","entities":[{"id":"x"}]}\n```',
    );
    expect(output.locale).toBe("it");
    expect(output.entities[0]?.id).toBe("x");
  });

  it("throws on invalid shape", () => {
    expect(() => parseOntologyExtractOutput('{"locale":"it"}')).toThrow(OntologyExtractOutputError);
  });
});
