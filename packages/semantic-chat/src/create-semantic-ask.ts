import type { Ontology } from "@trybacked/core";
import type {
  AnchorOperationAuditHook,
  AnchorService,
  SemanticAskBody,
  SemanticAskResponse,
} from "@trybacked/service";
import {
  createGatewayModelResolver,
  createSemanticAgentModelFromEnv,
  runSemanticAgent,
  SemanticAgentError,
  type ModelResolver,
} from "./agent/run-agent.js";
import type { SemanticAgentResult } from "./agent/types.js";
import {
  agentBudgetFromEnv,
  agentSkipRepairAfterMsFromEnv,
  askStrategyFromEnv,
} from "./ask-config.js";
import { runPlanFirst, type PlanFirstResult } from "./plan-first/run-plan-first.js";
import { tenantAiAskEnabled, type TenantAiAskCapabilities } from "./tenant-ai-ask.js";
export type { TenantAiAskCapabilities };
export type SemanticAskHandler = NonNullable<AnchorService["semanticAsk"]>;
/** What the planner and the agent need from a request; audit-only fields stay out. */
type AskContext = Pick<SemanticAskBody, "question" | "locale" | "history">;
export type AttachSemanticAskOptions = {
  ontology: Ontology;
  env: NodeJS.ProcessEnv;
  tenantCapabilities?: TenantAiAskCapabilities | undefined;
  onOperation?: AnchorOperationAuditHook | undefined;
  tenant?: string | undefined;
  /** Test seam: replaces the AI Gateway provider. */
  resolveModel?: ModelResolver | undefined;
};
export type SemanticAskAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      reason: "missing_llm_gateway" | "disabled_for_tenant";
    };
export function describeSemanticAskAvailability(
  env: NodeJS.ProcessEnv,
  tenantCapabilities?: TenantAiAskCapabilities,
): SemanticAskAvailability {
  if (createSemanticAgentModelFromEnv(env) === undefined) {
    return { available: false, reason: "missing_llm_gateway" };
  }
  if (!tenantAiAskEnabled(tenantCapabilities)) {
    return { available: false, reason: "disabled_for_tenant" };
  }
  return { available: true };
}
const QUESTION_PREVIEW_MAX_CHARS = 160;
function questionPreview(question: string): string {
  return question.length > QUESTION_PREVIEW_MAX_CHARS
    ? `${question.slice(0, QUESTION_PREVIEW_MAX_CHARS - 3)}…`
    : question;
}
function planFirstResponse(
  question: string,
  ontologyVersion: number,
  result: PlanFirstResult,
): SemanticAskResponse {
  return {
    text: result.answer,
    answer: result.answer,
    question,
    runId: result.runId,
    route: "single",
    ontologyVersion,
    attempts: 1,
    plan: result.plan,
    result: result.result,
    claims: result.claims,
    assumptions: result.assumptions,
    followUps: [],
    agentSteps: result.steps,
    usage: result.usage,
  };
}
function agentResponse(
  question: string,
  ontologyVersion: number,
  agent: SemanticAgentResult,
): SemanticAskResponse {
  return {
    text: agent.answer,
    answer: agent.answer,
    question,
    runId: agent.runId,
    route: "agent",
    ontologyVersion,
    attempts: 1,
    claims: agent.claims,
    assumptions: agent.assumptions,
    followUps: agent.followUps,
    agentSteps: agent.steps,
    usage: agent.usage,
    ...(agent.clarification !== undefined ? { clarification: agent.clarification } : {}),
  };
}
export function attachSemanticAsk(
  base: AnchorService,
  options: AttachSemanticAskOptions,
): AnchorService {
  const agentModel = createSemanticAgentModelFromEnv(options.env);
  const askEnabled = tenantAiAskEnabled(options.tenantCapabilities);
  const baseCapabilities = base.capabilities.bind(base);
  if (agentModel === undefined) {
    return Object.assign(base, {
      capabilities: () => ({
        ...baseCapabilities(),
        aiAsk: false,
      }),
    });
  }
  const { modelId, apiKey, fallbackModelId } = agentModel;
  const resolveModel = options.resolveModel ?? createGatewayModelResolver(apiKey);
  const strategy = askStrategyFromEnv(options.env);
  const ontologyVersion = options.ontology.metadata.version;
  const tenantField = options.tenant !== undefined ? { tenant: options.tenant } : {};

  const runAgent = (context: AskContext) =>
    runSemanticAgent({
      ontology: options.ontology,
      service: base,
      ...context,
      modelId,
      apiKey,
      resolveModel,
      budget: agentBudgetFromEnv(options.env),
      skipRepairAfterMs: agentSkipRepairAfterMsFromEnv(options.env),
      ...(fallbackModelId !== undefined ? { fallbackModelId } : {}),
    });

  async function answer(context: AskContext): Promise<SemanticAskResponse> {
    if (strategy === "plan-first") {
      const started = Date.now();
      const outcome = await runPlanFirst({
        ontology: options.ontology,
        service: base,
        ...context,
        model: resolveModel(modelId),
      });
      if (outcome.kind === "answered") {
        return planFirstResponse(context.question, ontologyVersion, outcome.result);
      }
      options.onOperation?.({
        operation: "planFallback",
        durationMs: Date.now() - started,
        question: questionPreview(context.question),
        reason: outcome.reason,
        ...tenantField,
      });
    }
    return agentResponse(context.question, ontologyVersion, await runAgent(context));
  }

  const semanticAsk: SemanticAskHandler = async (body) => {
    if (!askEnabled) {
      throw new SemanticAgentError("AI ask is disabled for this tenant.");
    }
    const started = Date.now();
    const response = await answer({
      question: body.question,
      locale: body.locale,
      history: body.history,
    });
    options.onOperation?.({
      operation: "semanticAsk",
      durationMs: Date.now() - started,
      rowCount: response.agentSteps?.at(-1)?.rowCount,
      question: questionPreview(body.question),
      runId: response.runId,
      conversationId: body.conversationId,
      route: response.route,
      ...tenantField,
    });
    options.onOperation?.({
      operation: "agentRun",
      durationMs: response.usage?.latencyMs ?? Date.now() - started,
      rowCount: response.agentSteps?.length,
      route: response.route,
      ...tenantField,
    });
    return response;
  };
  return Object.assign(base, {
    capabilities: () => ({
      ...baseCapabilities(),
      aiAsk: askEnabled,
    }),
    semanticAsk,
  });
}
