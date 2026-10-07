import type { Ontology } from "@trybacked/core";
import type {
  AnchorOperationAuditHook,
  AnchorService,
  SemanticAskBody,
  SemanticAskResponse,
} from "@trybacked/service";
import { isServiceErrorResult } from "@trybacked/service";
import { randomUUID } from "node:crypto";
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
import { searchTermsForQuestion } from "./document-evidence.js";
import {
  documentArchiveTermsFromOntology,
  documentSearchQueries,
  questionPrefersDocumentArchive,
} from "./document-intent.js";
import { renderDocumentSearchAnswer } from "./document-search-answer.js";
import { tryDocumentSynthesisAnswer } from "./document-synthesis.js";
import { runPlanFirst, type PlanFirstResult } from "./plan-first/run-plan-first.js";
import { isSparseListingProse, isThinWarehouseListing } from "./plan-first/thin-plan.js";
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
  // Archive intent terms come from the published ontology semantics, not from
  // keywords in code (Plan Fase 6).
  const documentTerms = documentArchiveTermsFromOntology(options.ontology);
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

  async function tryDocumentArchiveAnswer(
    context: AskContext,
  ): Promise<SemanticAskResponse | undefined> {
    if (!questionPrefersDocumentArchive(context.question, documentTerms)) {
      return undefined;
    }
    const started = Date.now();
    if (!base.capabilities().chunkSearch) {
      const italian = (context.locale ?? "it").toLowerCase().startsWith("it");
      const answer = italian
        ? "L’archivio documenti non è ancora disponibile per questo tenant: mancano le tabelle documenti curate nel warehouse. Provisionale tramite la tua data platform."
        : "The document archive is not available for this tenant yet: curated document tables are missing in the warehouse. Provision them via your data platform.";
      return {
        text: answer,
        answer,
        question: context.question,
        runId: randomUUID(),
        route: "single",
        ontologyVersion,
        attempts: 1,
        claims: [],
        assumptions: [],
        followUps: [],
        agentSteps: [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: Date.now() - started,
        },
      };
    }
    const mergedRows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const query of documentSearchQueries(context.question)) {
      const search = await base.chunkSearch({ query, limit: 12 });
      if (isServiceErrorResult(search)) {
        continue;
      }
      for (const row of search.rows) {
        const key =
          typeof row.elementId === "string"
            ? row.elementId
            : typeof row.element_id === "string"
              ? row.element_id
              : JSON.stringify(row);
        if (!seen.has(key)) {
          seen.add(key);
          mergedRows.push(row);
        }
      }
      if (mergedRows.length >= 12) {
        break;
      }
    }
    if (mergedRows.length === 0) {
      return undefined;
    }
    const rendered = renderDocumentSearchAnswer({
      rows: mergedRows.slice(0, 12),
      locale: context.locale,
    });
    const runId = randomUUID();
    return {
      text: rendered.answer,
      answer: rendered.answer,
      question: context.question,
      runId,
      route: "single",
      ontologyVersion,
      attempts: 1,
      claims: rendered.claims,
      assumptions: [],
      followUps: [],
      agentSteps: [
        {
          toolCallId: "document-search",
          toolName: "search_documents",
          input: { query: context.question, limit: 12 },
          status: "ok",
          rowCount: mergedRows.length,
          durationMs: Date.now() - started,
        },
      ],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async function tryDocumentSynthesis(
    context: AskContext,
  ): Promise<SemanticAskResponse | undefined> {
    const outcome = await tryDocumentSynthesisAnswer({
      service: base,
      question: context.question,
      documentTerms,
      locale: context.locale,
      ontologyVersion,
      resolveModel,
      modelId,
    });
    if (outcome.kind === "answered") {
      return outcome.response;
    }
    return undefined;
  }

  function prefersDocumentEvidenceFirst(question: string): boolean {
    // Archive-explicit questions are handled by the archive reader; the rest go
    // document-first when they carry at least two search terms (semantics-driven
    // routing, no domain keywords in code).
    if (questionPrefersDocumentArchive(question, documentTerms)) {
      return false;
    }
    return searchTermsForQuestion(question).length >= 2;
  }

  async function answer(context: AskContext): Promise<SemanticAskResponse> {
    const documentAnswer = await tryDocumentArchiveAnswer(context);
    if (documentAnswer !== undefined) {
      return documentAnswer;
    }
    if (prefersDocumentEvidenceFirst(context.question)) {
      const synthesized = await tryDocumentSynthesis(context);
      if (synthesized !== undefined) {
        return synthesized;
      }
    }
    if (strategy === "plan-first") {
      const started = Date.now();
      const outcome = await runPlanFirst({
        ontology: options.ontology,
        service: base,
        ...context,
        model: resolveModel(modelId),
      });
      if (outcome.kind === "answered") {
        const sparseListing =
          isThinWarehouseListing(outcome.result) || isSparseListingProse(outcome.result);
        if (!sparseListing) {
          return planFirstResponse(context.question, ontologyVersion, outcome.result);
        }
        const synthesized = await tryDocumentSynthesis(context);
        if (synthesized !== undefined) {
          return synthesized;
        }
      } else {
        options.onOperation?.({
          operation: "planFallback",
          durationMs: Date.now() - started,
          question: questionPreview(context.question),
          reason: outcome.reason,
          ...tenantField,
        });
      }
    }
    if (!prefersDocumentEvidenceFirst(context.question)) {
      const synthesized = await tryDocumentSynthesis(context);
      if (synthesized !== undefined) {
        return synthesized;
      }
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
