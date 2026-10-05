import { assertCase } from "./semantic-nl-assertions.mjs";
export const AGENT_OUTCOMES = [
  "answered_with_query",
  "answered_without_query",
  "clarified",
  "error",
];
function isQueryResult(value) {
  return typeof value === "object" && value !== null && "rowCount" in value;
}
export function lastSuccessfulQuery(agent) {
  const steps = agent?.steps ?? [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.toolName !== "query_objects" || step.status === "error") {
      continue;
    }
    const result = agent.toolResults.get(step.toolCallId);
    if (isQueryResult(result)) {
      return { input: step.input ?? {}, result };
    }
  }
  return undefined;
}
export function agentOutcome(agent, error) {
  if (error !== undefined || agent === undefined) {
    return "error";
  }
  if (agent.clarification !== undefined) {
    return "clarified";
  }
  return lastSuccessfulQuery(agent) !== undefined
    ? "answered_with_query"
    : "answered_without_query";
}
export function toolErrorCount(agent) {
  return (agent?.steps ?? []).filter((step) => step.status === "error").length;
}
export function agentAnswerShape(agent, question) {
  const query = lastSuccessfulQuery(agent);
  const input = query?.input ?? {};
  const result =
    query !== undefined
      ? {
          objectId: String(query.result.objectId ?? input.objectId ?? ""),
          mode: String(query.result.mode ?? input.mode ?? "rows"),
          rowCount: Number(query.result.rowCount ?? 0),
          rows: Array.isArray(query.result.rows) ? query.result.rows : [],
          sql: typeof query.result.sql === "string" ? query.result.sql : "",
        }
      : undefined;
  return {
    question,
    route: "agent",
    plan: { objectQuery: input },
    result,
    steps: agent.steps,
    attempts: 1,
    provenance: agent.steps.map((step) => ({
      tool: step.toolName,
      durationMs: step.durationMs,
    })),
  };
}
export function assertAgentTraceExpect(expectation, agent) {
  const failures = [];
  if (expectation === undefined) {
    return failures;
  }
  if (expectation.toolsInclude !== undefined) {
    const tools = new Set(agent.steps.map((step) => step.toolName));
    for (const tool of expectation.toolsInclude) {
      if (!tools.has(tool)) {
        failures.push(`trace missing tool ${tool}`);
      }
    }
  }
  const input = lastSuccessfulQuery(agent)?.input ?? {};
  for (const key of ["orderBy", "orderDirection"]) {
    if (expectation[key] !== undefined && input[key] !== expectation[key]) {
      failures.push(`${key} ${String(input[key])} !== ${String(expectation[key])}`);
    }
  }
  return failures;
}
export function assertAgentCase(expectation, agent, error, question) {
  if (expectation === undefined) {
    return [];
  }
  const outcome = agentOutcome(agent, error);
  if (expectation.shouldFail === true || outcome === "error") {
    return assertCase(expectation, undefined, error);
  }
  if (outcome !== "answered_with_query") {
    return [`no successful query_objects (outcome: ${outcome})`];
  }
  return [
    ...assertCase(expectation, agentAnswerShape(agent, question), undefined),
    ...assertAgentTraceExpect(expectation, agent),
  ];
}
