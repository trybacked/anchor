import { SemanticAgentError, SemanticPlanValidationError } from "@trybacked/semantic-chat";
import {
  getChatAskStatus,
  preferredLanguage,
  resolveChatAsk,
  SemanticAskBodySchema,
} from "@trybacked/service";
import { getAnchorService } from "../platform-api-handler-utils.js";
import { platformRoute, postJsonRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";
const ASK_UNAVAILABLE_MESSAGES = {
  missing_llm_gateway:
    "AI ask is not configured on this deployment (set AI_GATEWAY_API_KEY on platform-api).",
  disabled_for_tenant: "AI ask is disabled for this tenant.",
} as const;
export const platformApiSemanticChatRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "chatAskStatus",
      method: "get",
      path: `${V1_PATH_PREFIX}/chat/ask/status`,
      summary: "Whether natural-language ask is available for this tenant",
      tags: ["semantic-chat"],
      responses: {
        "200": {
          description: "available true when POST /v1/chat/ask will run; otherwise reason code",
        },
      },
    },
    () => (c) => {
      const service = getAnchorService(c);
      return c.json(getChatAskStatus(service));
    },
  ),
  postJsonRoute(
    {
      operationId: "semanticAsk",
      path: `${V1_PATH_PREFIX}/chat/ask`,
      summary: "Ask a natural-language question over governed data",
      tags: ["semantic-chat"],
      jsonBody: jsonBody("SemanticAskBody", SemanticAskBodySchema, {
        question: "How many customers were onboarded last month?",
      }),
      responses: {
        "200": {
          description:
            "Answer text plus optional clarification, agentSteps (SQL trace), claims, usage, runId",
        },
        "422": { description: "Agent or validation error" },
        "503": { description: "Ask not available (see GET /v1/chat/ask/status)" },
      },
    },
    async (c, body) => {
      const resolution = resolveChatAsk(getAnchorService(c));
      if (!resolution.available) {
        return c.json({ error: ASK_UNAVAILABLE_MESSAGES[resolution.reason] }, 503);
      }
      try {
        const locale = preferredLanguage(c.req.header("accept-language"));
        const answer = await resolution.ask({
          question: body.question,
          ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
          ...(locale !== undefined ? { locale } : {}),
        });
        return c.json(answer);
      } catch (error) {
        if (error instanceof SemanticPlanValidationError || error instanceof SemanticAgentError) {
          return c.json({ error: error.message }, 422);
        }
        throw error;
      }
    },
  ),
];
