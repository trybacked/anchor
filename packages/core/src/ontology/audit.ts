import { z } from "zod";
import { ReviewQuestionKindSchema } from "../review-questions.js";
import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "../constants.js";
import type { Entity, Relation, Rule } from "../model.js";
import type { Proposal } from "../proposal.js";
import { collectVerdicts, type Review, type ReviewAnswer } from "../review.js";

export const AuditActionSchema = z.enum([
  "accept",
  "reject",
  "rename",
  "modify",
  "merge",
  "split",
  "add",
  "remove",
  "override",
  "auto_confirm",
  "publish",
  "rollback",
]);

export const AuditActorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).optional(),
});

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  recordedAt: z.string().datetime(),
  runId: z.string().min(1),
  action: AuditActionSchema,
  elementKind: ReviewQuestionKindSchema.optional(),
  elementId: z.string().min(1).optional(),
  questionId: z.string().min(1).optional(),
  actor: AuditActorSchema.optional(),
  source: z.enum(["human", "system", "inferred"]),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const AuditLogSchema = z.object({
  version: z.literal(1),
  events: z.array(AuditEventSchema),
});

export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditActor = z.infer<typeof AuditActorSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const EMPTY_AUDIT_LOG: AuditLog = { version: 1, events: [] };

function decisionToAction(decision: ReviewAnswer["decision"]): AuditAction {
  switch (decision) {
    case "yes":
      return "accept";
    case "no":
      return "reject";
    case "rename":
      return "rename";
    default: {
      const _exhaustive: never = decision;
      throw new Error(`Unhandled review decision: ${String(_exhaustive)}`);
    }
  }
}

function auditEventId(runId: string, questionId: string, action: AuditAction): string {
  return `${runId}:${questionId}:${action}`;
}

export type BuildReviewAuditEventsOptions = {
  actor?: AuditActor;
};

export function buildReviewAuditEvents(
  proposal: Proposal,
  review: Review,
  options: BuildReviewAuditEventsOptions = {},
): AuditEvent[] {
  const questionsById = new Map(proposal.questions.map((question) => [question.id, question]));
  const events: AuditEvent[] = [];

  for (const answer of review.answers) {
    const question = questionsById.get(answer.questionId);
    if (question === undefined) {
      continue;
    }
    const action = decisionToAction(answer.decision);
    const event: AuditEvent = {
      id: auditEventId(review.runId, answer.questionId, action),
      recordedAt: review.answeredAt,
      runId: review.runId,
      action,
      elementKind: question.kind,
      elementId: question.targetId,
      questionId: question.id,
      source: "human",
    };
    if (options.actor !== undefined) {
      event.actor = options.actor;
    }
    if (review.reviewer !== undefined) {
      event.actor = { id: review.reviewer };
    }
    if (action === "rename" && answer.newName !== undefined) {
      event.detail = { newName: answer.newName };
    }
    events.push(event);
  }

  return events;
}

function verdictKey(kind: string, targetId: string): string {
  return `${kind}:${targetId}`;
}

export function buildAutoConfirmAuditEvents(
  proposal: Proposal,
  review: Review,
  entities: Entity[],
  relations: Relation[],
  rules: Rule[],
  options: { reviewConfidenceThreshold?: number } = {},
): AuditEvent[] {
  const threshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  const { verdicts } = collectVerdicts(proposal.questions, review.answers);
  const reviewedKeys = new Set(proposal.questions.map((q) => verdictKey(q.kind, q.targetId)));
  const events: AuditEvent[] = [];
  const recordedAt = review.answeredAt;

  const maybeAutoConfirm = (
    kind: "entity" | "relation" | "rule",
    id: string,
    confidence: number,
    status: Entity["status"],
  ): void => {
    const key = verdictKey(kind, id);
    if (verdicts.has(key) || reviewedKeys.has(key)) {
      return;
    }
    if (status !== "confirmed" && status !== "renamed") {
      return;
    }
    if (confidence < threshold) {
      return;
    }
    events.push({
      id: `${review.runId}:auto_confirm:${key}`,
      recordedAt,
      runId: review.runId,
      action: "auto_confirm",
      elementKind: kind,
      elementId: id,
      source: "system",
      detail: { confidence, threshold },
    });
  };

  for (const entity of entities) {
    maybeAutoConfirm("entity", entity.id, entity.confidence, entity.status);
  }
  for (const relation of relations) {
    maybeAutoConfirm("relation", relation.id, relation.confidence, relation.status);
  }
  for (const rule of rules) {
    maybeAutoConfirm("rule", rule.id, rule.confidence, rule.status);
  }

  return events;
}

export function buildRollbackAuditEvent(input: {
  runId: string;
  recordedAt: string;
  fromVersion: number;
  toVersion: number;
  actor?: AuditActor;
}): AuditEvent {
  const event: AuditEvent = {
    id: `${input.runId}:rollback:${String(input.fromVersion)}:${String(input.toVersion)}`,
    recordedAt: input.recordedAt,
    runId: input.runId,
    action: "rollback",
    source: "human",
    detail: { fromVersion: input.fromVersion, toVersion: input.toVersion },
  };
  if (input.actor !== undefined) {
    event.actor = input.actor;
  }
  return event;
}

export function buildPublishAuditEvent(input: {
  runId: string;
  recordedAt: string;
  publicationVersion: number;
  actor?: AuditActor;
}): AuditEvent {
  const event: AuditEvent = {
    id: `${input.runId}:publish:${String(input.publicationVersion)}`,
    recordedAt: input.recordedAt,
    runId: input.runId,
    action: "publish",
    source: "human",
    detail: { publicationVersion: input.publicationVersion },
  };
  if (input.actor !== undefined) {
    event.actor = input.actor;
  }
  return event;
}

export function mergeAuditLogs(...logs: AuditLog[]): AuditLog {
  const events = logs.flatMap((log) => log.events);
  events.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  return AuditLogSchema.parse({ version: 1, events });
}
