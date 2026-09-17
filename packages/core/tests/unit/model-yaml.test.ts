import { describe, expect, it } from "vitest";
import { parseModelYaml, serializeModelYaml } from "../../src/model-yaml.js";

const MINIMAL_MODEL = `
metadata:
  formatVersion: "1"
  runId: run-test
  generatedAt: "2026-01-01T00:00:00.000Z"
entities: []
relations: []
rules: []
`.trim();

describe("model-yaml", () => {
  it("round-trips semantic models through YAML", () => {
    const model = parseModelYaml(MINIMAL_MODEL);
    const yaml = serializeModelYaml(model);
    const reparsed = parseModelYaml(yaml);
    expect(reparsed.metadata.runId).toBe("run-test");
    expect(reparsed.entities).toEqual([]);
  });

  it("rejects invalid model YAML", () => {
    expect(() => parseModelYaml("not: [valid")).toThrow();
  });
});
