import type {
  SemanticAskAbstention,
  SemanticAskOutcome,
  SemanticAskResponse,
} from "@trybacked/service";
import { randomUUID } from "node:crypto";

const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export function abstainedAskResponse(options: {
  question: string;
  ontologyVersion: number;
  abstention: SemanticAskAbstention;
  followUps?: readonly string[] | undefined;
  route?: SemanticAskResponse["route"] | undefined;
  agentSteps?: SemanticAskResponse["agentSteps"] | undefined;
  startedAt?: number | undefined;
}): SemanticAskResponse {
  const answer = options.abstention.explanation;
  return {
    text: answer,
    answer,
    question: options.question,
    runId: randomUUID(),
    route: options.route ?? "single",
    ontologyVersion: options.ontologyVersion,
    attempts: 1,
    claims: [],
    assumptions: [],
    followUps: options.followUps !== undefined ? [...options.followUps] : [],
    agentSteps: options.agentSteps,
    usage: {
      ...EMPTY_USAGE,
      latencyMs: Math.max(0, Date.now() - (options.startedAt ?? Date.now())),
    },
    abstention: options.abstention,
    outcome: "abstained",
  };
}

export function askOutcome(
  response: Pick<SemanticAskResponse, "clarification" | "abstention">,
): SemanticAskOutcome {
  if (response.abstention !== undefined) {
    return "abstained";
  }
  if (response.clarification !== undefined) {
    return "clarification";
  }
  return "answered";
}
