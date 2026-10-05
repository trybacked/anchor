import { describe, expect, it } from "vitest";
import { evaluateClarification } from "../../src/agent/clarification-policy.js";
import { contractOntology } from "./agent-fixtures.js";
const ontology = contractOntology();
const dateCandidates = { objectId: "contract", propertyIds: ["load_month", "published_on"] };
describe("evaluateClarification", () => {
  it("accepts value-level clarifications without property candidates", () => {
    expect(evaluateClarification(ontology, "Which Gerace?", undefined)).toEqual({ accepted: true });
  });
  it("rejects when the question already names exactly one candidate", () => {
    const verdict = evaluateClarification(
      ontology,
      "Contracts published in June 2025",
      dateCandidates,
    );
    expect(verdict).toMatchObject({ accepted: false });
    expect(verdict.accepted === false && verdict.reason).toContain("contract.published_on");
  });
  it("matches property ids written with underscores", () => {
    const verdict = evaluateClarification(
      ontology,
      "count where load_month is 2025-06",
      dateCandidates,
    );
    expect(verdict.accepted === false && verdict.reason).toContain("contract.load_month");
  });
  it("rejects in favour of the default time dimension when nothing is named", () => {
    const verdict = evaluateClarification(
      ontology,
      "How many contracts in June 2025?",
      dateCandidates,
    );
    expect(verdict.accepted === false && verdict.reason).toContain("default time dimension");
  });
  it("accepts genuine ambiguity the ontology cannot settle", () => {
    const verdict = evaluateClarification(ontology, "Contracts by area", {
      objectId: "contract",
      propertyIds: ["region", "cig"],
    });
    expect(verdict).toEqual({ accepted: true });
  });
  it("rejects unknown objects and properties", () => {
    expect(
      evaluateClarification(ontology, "q", { objectId: "nope", propertyIds: ["a", "b"] }),
    ).toMatchObject({
      accepted: false,
    });
    expect(
      evaluateClarification(ontology, "q", {
        objectId: "contract",
        propertyIds: ["load_month", "ghost"],
      }),
    ).toMatchObject({ accepted: false });
  });
});
