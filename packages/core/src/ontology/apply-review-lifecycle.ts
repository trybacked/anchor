import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "../constants.js";
import type { Proposal } from "../proposal.js";
import { applyReview, collectVerdicts, type Review } from "../review.js";
import type { OntologyLifecycleStage } from "./lifecycle.js";
import { lifecycleFromModelStatus } from "./lifecycle.js";
import { semanticModelToOntology } from "./semantic-model-bridge.js";
import type {
  Ontology,
  OntologyAction,
  OntologyLogic,
  OntologyObject,
  OntologyRelationship,
} from "./spec.js";

/**
 *
 */
export type ApplyReviewLifecycleOptions = {
  ontologyId: string;
  reviewConfidenceThreshold?: number;
  baseOntology?: Ontology;
};

/**
 *
 */
export type ReviewLifecycleResult = {
  ontology: Ontology;
};

function withObjectLifecycle(
  object: OntologyObject,
  stage: OntologyLifecycleStage,
): OntologyObject {
  return { ...object, lifecycle: stage };
}

function withRelationshipLifecycle(
  relationship: OntologyRelationship,
  stage: OntologyLifecycleStage,
): OntologyRelationship {
  return { ...relationship, lifecycle: stage };
}

function withLogicLifecycle(entry: OntologyLogic, stage: OntologyLifecycleStage): OntologyLogic {
  return { ...entry, lifecycle: stage };
}

function withActionLifecycle(
  action: OntologyAction,
  stage: OntologyLifecycleStage,
): OntologyAction {
  return { ...action, lifecycle: stage };
}

function lifecycleAfterReview(
  targetId: string,
  kind: "entity" | "relation" | "rule",
  verdictKeys: Set<string>,
  modelLifecycle: OntologyLifecycleStage,
): OntologyLifecycleStage {
  const key = `${kind}:${targetId}`;
  if (verdictKeys.has(key) && modelLifecycle === "confirmed") {
    return "reviewed";
  }
  return modelLifecycle;
}

/**
 *
 */
export function applyReviewLifecycle(
  proposal: Proposal,
  review: Review,
  options: ApplyReviewLifecycleOptions,
): ReviewLifecycleResult {
  const threshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  const { model } = applyReview(proposal, review, new Date(), {
    reviewConfidenceThreshold: threshold,
  });
  const { verdicts } = collectVerdicts(proposal.questions, review.answers);
  const verdictKeys = new Set(verdicts.keys());

  const governedOntology = semanticModelToOntology(model, {
    ontologyId: options.ontologyId,
    ...(options.baseOntology !== undefined
      ? { version: options.baseOntology.metadata.version }
      : {}),
  });

  const baseByObjectId = new Map(
    (options.baseOntology?.objects ?? []).map((object) => [object.id, object]),
  );

  const ontology: Ontology = {
    ...governedOntology,
    objects: governedOntology.objects.map((object) => {
      const base = baseByObjectId.get(object.id);
      const modelLifecycle = lifecycleFromModelStatus(object.status ?? "proposed");
      const lifecycle = lifecycleAfterReview(object.id, "entity", verdictKeys, modelLifecycle);
      return withObjectLifecycle(
        {
          ...object,
          ...(base?.provenance !== undefined ? { provenance: base.provenance } : {}),
          ...(base?.source !== undefined ? { source: base.source } : {}),
        },
        lifecycle,
      );
    }),
    relationships: governedOntology.relationships.map((relationship) => {
      const modelLifecycle = lifecycleFromModelStatus(relationship.status ?? "proposed");
      const lifecycle = lifecycleAfterReview(
        relationship.id,
        "relation",
        verdictKeys,
        modelLifecycle,
      );
      return withRelationshipLifecycle(relationship, lifecycle);
    }),
    logic: governedOntology.logic.map((entry) => {
      const modelLifecycle = lifecycleFromModelStatus(entry.status ?? "proposed");
      const lifecycle = lifecycleAfterReview(entry.id, "rule", verdictKeys, modelLifecycle);
      return withLogicLifecycle(entry, lifecycle);
    }),
  };

  return { ontology };
}

/**
 *
 */
export function markOntologyPublished(ontology: Ontology, publishedAt: string): Ontology {
  const toPublished = (): OntologyLifecycleStage => "published";
  return {
    ...ontology,
    metadata: { ...ontology.metadata, generatedAt: publishedAt },
    objects: ontology.objects.map((object) => withObjectLifecycle(object, toPublished())),
    relationships: ontology.relationships.map((relationship) =>
      withRelationshipLifecycle(relationship, toPublished()),
    ),
    logic: ontology.logic.map((entry) => withLogicLifecycle(entry, toPublished())),
    actions: ontology.actions.map((action) => withActionLifecycle(action, toPublished())),
  };
}
