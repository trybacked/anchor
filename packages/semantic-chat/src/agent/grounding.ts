import { resultContainsNumeric } from "./numeric-grounding.js";
import type { SemanticAnswerClaim, SemanticAgentStep } from "./types.js";
export class SemanticGroundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticGroundingError";
  }
}
function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d.,]*/g) ?? [];
  return matches
    .map((value) => value.replaceAll(",", "").replace(/[.,]+$/, ""))
    .filter((value) => value.length > 0);
}
function skipClaimNumberCheck(digits: string): boolean {
  if (/^\d{4}$/.test(digits)) {
    const year = Number.parseInt(digits, 10);
    return year >= 1990 && year <= 2035;
  }
  if (digits.length === 1) {
    return true;
  }
  if (digits.length === 2) {
    const month = Number.parseInt(digits, 10);
    return month >= 1 && month <= 12;
  }
  return false;
}
function normalizeToolReference(reference: string): string {
  return reference.trim().replace(/^functions\./, "");
}
export type GroundingStep = Pick<SemanticAgentStep, "toolCallId" | "toolName" | "status">;
function evidenceToolCallIds(
  steps: readonly GroundingStep[],
  toolResults: Map<string, unknown>,
  toolName?: string,
): string[] {
  return steps
    .filter(
      (step) =>
        step.status === "ok" &&
        toolResults.has(step.toolCallId) &&
        (toolName === undefined || step.toolName === toolName),
    )
    .map((step) => step.toolCallId);
}
export function resolveToolCallId(
  reference: string,
  steps: readonly GroundingStep[],
  toolResults: Map<string, unknown>,
): string | undefined {
  if (toolResults.has(reference)) {
    return reference;
  }
  const normalized = normalizeToolReference(reference);
  if (toolResults.has(normalized)) {
    return normalized;
  }
  const positional = /^(?:tool|call)[-_](\d+)$/i.exec(normalized);
  const positionalSlot = positional?.[1];
  if (positionalSlot !== undefined) {
    const slot = Number.parseInt(positionalSlot, 10);
    const evidence = evidenceToolCallIds(steps, toolResults);
    return evidence[slot] ?? evidence[slot - 1];
  }
  if (/^\d+$/.test(normalized)) {
    const slot = Number.parseInt(normalized, 10);
    const queries = evidenceToolCallIds(steps, toolResults, "query_objects");
    return queries[slot - 1] ?? queries[0];
  }
  const named = /^([a-z][a-z0-9_]*)(?:[-_](\d+))?$/i.exec(normalized);
  const toolName = named?.[1];
  if (toolName === undefined) {
    return undefined;
  }
  const matches = evidenceToolCallIds(steps, toolResults, toolName);
  const ordinalRaw = named?.[2];
  if (ordinalRaw === undefined) {
    return matches[matches.length - 1];
  }
  const ordinal = Number.parseInt(ordinalRaw, 10);
  return matches[ordinal - 1] ?? matches[ordinal];
}
function resultSupportsNumbers(result: unknown, numbers: readonly string[]): boolean {
  return numbers.every((number) => resultContainsNumeric(result, number));
}
function pickLastSupportingFallback(
  fallbacks: readonly string[],
  steps: readonly GroundingStep[],
): string | undefined {
  let last: string | undefined;
  for (const step of steps) {
    if (step.status === "ok" && fallbacks.includes(step.toolCallId)) {
      last = step.toolCallId;
    }
  }
  return last;
}
function bindClaim(
  claim: SemanticAnswerClaim,
  steps: readonly GroundingStep[],
  toolResults: Map<string, unknown>,
): SemanticAnswerClaim {
  const cited = resolveToolCallId(claim.toolCallId, steps, toolResults) ?? claim.toolCallId;
  const numbers = extractNumbers(claim.text).filter((number) => !skipClaimNumberCheck(number));
  const citedResult = toolResults.get(cited);
  if (citedResult !== undefined && resultSupportsNumbers(citedResult, numbers)) {
    return cited === claim.toolCallId ? claim : { ...claim, toolCallId: cited };
  }
  const fallbacks = evidenceToolCallIds(steps, toolResults).filter((toolCallId) =>
    resultSupportsNumbers(toolResults.get(toolCallId), numbers),
  );
  if (fallbacks.length === 1) {
    const rebound = fallbacks[0];
    if (rebound === undefined) {
      throw new SemanticGroundingError("Internal grounding error: missing rebound target.");
    }
    return { ...claim, toolCallId: rebound };
  }
  if (fallbacks.length > 1) {
    const rebound = pickLastSupportingFallback(fallbacks, steps);
    if (rebound === undefined) {
      throw new SemanticGroundingError("Internal grounding error: missing rebound target.");
    }
    return { ...claim, toolCallId: rebound };
  }
  if (citedResult === undefined) {
    throw new SemanticGroundingError(`Claim references missing tool call "${claim.toolCallId}".`);
  }
  const missing = numbers.find((number) => !resultContainsNumeric(citedResult, number));
  throw new SemanticGroundingError(`Claim value "${missing ?? ""}" not found in any tool result.`);
}
export type GroundedAnswer = {
  claims: SemanticAnswerClaim[];
};
export function groundAnswer(options: {
  answer: string;
  claims: SemanticAnswerClaim[];
  steps: readonly GroundingStep[];
  toolResults: Map<string, unknown>;
}): GroundedAnswer {
  const claims = options.claims.map((claim) =>
    bindClaim(claim, options.steps, options.toolResults),
  );
  if (claims.length === 0) {
    return { claims };
  }
  const evidence = evidenceToolCallIds(options.steps, options.toolResults);
  for (const number of extractNumbers(options.answer)) {
    if (skipClaimNumberCheck(number)) {
      continue;
    }
    const supported = evidence.some((toolCallId) =>
      resultContainsNumeric(options.toolResults.get(toolCallId), number),
    );
    if (!supported) {
      throw new SemanticGroundingError(
        `Answer mentions "${number}" without a matching grounded claim.`,
      );
    }
  }
  return { claims };
}
export function validateAnswerGrounding(options: {
  answer: string;
  claims: SemanticAnswerClaim[];
  steps: readonly GroundingStep[];
  toolResults: Map<string, unknown>;
}): void {
  groundAnswer(options);
}
