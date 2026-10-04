import type { SemanticAnswerClaim } from "./types.js";

export class SemanticGroundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticGroundingError";
  }
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d.,]*/g) ?? [];
  return matches.map((value) => value.replaceAll(",", ""));
}

function resultContainsNumber(result: unknown, needle: string): boolean {
  const serialized = JSON.stringify(result);
  return serialized.includes(needle);
}

export function validateAnswerGrounding(options: {
  answer: string;
  claims: SemanticAnswerClaim[];
  toolResults: Map<string, unknown>;
}): void {
  for (const claim of options.claims) {
    const result = options.toolResults.get(claim.toolCallId);
    if (result === undefined) {
      throw new SemanticGroundingError(
        `Claim references missing tool call "${claim.toolCallId}".`,
      );
    }
    for (const number of extractNumbers(claim.text)) {
      if (number.length === 0) {
        continue;
      }
      if (!resultContainsNumber(result, number)) {
        throw new SemanticGroundingError(
          `Claim value "${number}" not found in tool result "${claim.toolCallId}".`,
        );
      }
    }
  }

  for (const number of extractNumbers(options.answer)) {
    if (number.length === 0) {
      continue;
    }
    const supported = options.claims.some((claim) => {
      const result = options.toolResults.get(claim.toolCallId);
      return result !== undefined && resultContainsNumber(result, number);
    });
    if (!supported && options.claims.length > 0) {
      throw new SemanticGroundingError(
        `Answer mentions "${number}" without a matching grounded claim.`,
      );
    }
  }
}
