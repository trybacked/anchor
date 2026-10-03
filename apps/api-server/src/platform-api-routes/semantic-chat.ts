import {
  SemanticChatTranslationError,
  SemanticPlanValidationError,
} from "@trybacked/semantic-chat";
import { SemanticAskBodySchema } from "@trybacked/service";
import { getAnchorService } from "../platform-api-handler-utils.js";
import { postJsonRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";

export const platformApiSemanticChatRoutes: RouteFactory[] = [
  postJsonRoute(
    {
      operationId: "semanticAsk",
      path: `${V1_PATH_PREFIX}/chat/ask`,
      summary: "Natural-language question",
      tags: ["semantic-chat"],
      jsonBody: jsonBody("SemanticAskBody", SemanticAskBodySchema, {
        question: "How many contracts in June 2025?",
        evidence: true,
      }),
      responses: {
        "200": {
          description:
            "NL answer with route (single|template), execution steps, SQL, rows/count, and provenance",
        },
        "503": { description: "Unavailable" },
      },
    },
    async (c, body) => {
      const service = getAnchorService(c);
      if (service.semanticAsk === undefined) {
        return c.json(
          { error: "Semantic chat is unavailable: set AI_GATEWAY_API_KEY (Vercel AI Gateway)." },
          503,
        );
      }
      try {
        const answer = await service.semanticAsk({
          question: body.question,
          ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
        });
        return c.json(answer);
      } catch (error) {
        if (
          error instanceof SemanticPlanValidationError ||
          error instanceof SemanticChatTranslationError
        ) {
          return c.json({ error: error.message }, 422);
        }
        throw error;
      }
    },
  ),
];
