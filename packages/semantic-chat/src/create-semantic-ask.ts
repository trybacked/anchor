import type { Ontology } from "@trybacked/core";
import type {
  AnchorOperationAuditHook,
  AnchorService,
  SemanticAskResponse,
} from "@trybacked/service";
import {
  createSemanticAgentModelFromEnv,
  runSemanticAgent,
  SemanticAgentError,
} from "./agent/run-agent.js";
import { tenantAiAskEnabled, type TenantAiAskCapabilities } from "./tenant-ai-ask.js";
export type { TenantAiAskCapabilities };
export type SemanticAskHandler = (body: {
  question: string;
  evidence?: boolean | undefined;
}) => Promise<SemanticAskResponse>;
export type AttachSemanticAskOptions = {
  ontology: Ontology;
  env: NodeJS.ProcessEnv;
  tenantCapabilities?: TenantAiAskCapabilities | undefined;
  onOperation?: AnchorOperationAuditHook | undefined;
  tenant?: string | undefined;
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
  const semanticAsk: SemanticAskHandler = async (body) => {
    if (!askEnabled) {
      throw new SemanticAgentError("AI ask is disabled for this tenant.");
    }
    const agentStarted = Date.now();
    const agent = await runSemanticAgent({
      ontology: options.ontology,
      service: base,
      question: body.question,
      modelId: agentModel.modelId,
      apiKey: agentModel.apiKey,
      ...(agentModel.fallbackModelId !== undefined
        ? { fallbackModelId: agentModel.fallbackModelId }
        : {}),
    });
    options.onOperation?.({
      operation: "semanticAsk",
      durationMs: Date.now() - agentStarted,
      rowCount: agent.steps.at(-1)?.rowCount,
      ...(options.tenant !== undefined ? { tenant: options.tenant } : {}),
    });
    options.onOperation?.({
      operation: "agentRun",
      durationMs: agent.usage.latencyMs,
      rowCount: agent.steps.length,
      ...(options.tenant !== undefined ? { tenant: options.tenant } : {}),
    });
    return {
      text: agent.answer,
      answer: agent.answer,
      question: body.question,
      runId: agent.runId,
      route: "agent",
      ontologyVersion: options.ontology.metadata.version,
      attempts: 1,
      claims: agent.claims,
      assumptions: agent.assumptions,
      followUps: agent.followUps,
      agentSteps: agent.steps,
      usage: agent.usage,
      ...(agent.clarification !== undefined ? { clarification: agent.clarification } : {}),
    };
  };
  return Object.assign(base, {
    capabilities: () => ({
      ...baseCapabilities(),
      aiAsk: askEnabled,
    }),
    semanticAsk,
  });
}
