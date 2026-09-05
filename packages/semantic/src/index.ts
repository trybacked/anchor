/** Agentic LLM bursts: semantic inference from compressed profiles */

export const PACKAGE_NAME = "@backed/semantic" as const;

export { COMPRESSED_TOP_VALUES_LIMIT, compressProfile } from "./compress.js";
export type { CompressedColumn, CompressedTable } from "./compress.js";

export {
  AI_GATEWAY_API_KEY_ENV,
  CHEAP_MODEL_ENV,
  FRONTIER_MODEL_ENV,
  REVIEW_CONFIDENCE_THRESHOLD_ENV,
  DEFAULT_CHEAP_MODEL,
  DEFAULT_FRONTIER_MODEL,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_CLASSIFICATION_BATCH_SIZE,
  REQUEST_TIMEOUT_MS_ENV,
  CLASSIFICATION_BATCH_SIZE_ENV,
  MissingApiKeyError,
  InvalidReviewThresholdError,
  InvalidRequestTimeoutError,
  InvalidClassificationBatchSizeError,
  resolveSemanticModels,
  resolveReviewConfidenceThreshold,
  resolveSemanticRequestTimeoutMs,
  resolveClassificationBatchSize,
} from "./env.js";
export type { SemanticModels } from "./env.js";

export { ColumnClassificationOutputSchema, OntologyOutputSchema } from "./llm-output.js";
export type { ColumnClassificationOutput, OntologyOutput } from "./llm-output.js";

export { selectReviewQuestions } from "./questions.js";

export { runBurst } from "./burst.js";
export type { BurstRequest, BurstUsage, BurstResult } from "./burst.js";

export { proposeModel } from "./propose.js";
export type { ProposeModelOptions } from "./propose.js";
export { mergeIncrementalProposal } from "./merge-proposal.js";

export { extractDocumentCatalog, DocumentExtractionOutputSchema, DOCUMENT_EXTRACTION_BATCH_SIZE } from "./extract-document-catalog.js";
export type { DocumentExtractionSample, ExtractDocumentCatalogOptions } from "./extract-document-catalog.js";

export {
  buildDocumentCorpusEntities,
  buildDocumentCorpusRelations,
  classifyTypedDocumentTables,
  DOCUMENT_TEXT_ENTITY_ID,
} from "./document-ontology.js";

export {
  isLineDocumentTable,
  isDocumentCorpus,
  splitTablesByKind,
} from "./line-document.js";
