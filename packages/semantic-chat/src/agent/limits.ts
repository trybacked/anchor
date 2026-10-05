import { SEMANTIC_CHAT_MAX_ROW_LIMIT } from "@trybacked/core";
export const DEFAULT_AGENT_MAX_STEPS = 6;
export const DEFAULT_AGENT_MAX_SQL_CALLS = 2;
/** After this many successful query_objects, only submit_answer is offered. */
export const AGENT_FORCE_ANSWER_AFTER_WAREHOUSE_OK = 1;
export const DEFAULT_AGENT_MAX_QUERY_ROWS = SEMANTIC_CHAT_MAX_ROW_LIMIT;
export const AGENT_GROUNDING_REPAIR_MAX_STEPS = 2;
export const AGENT_PROMPT_MAX_OBJECTS = 4;
export const AGENT_PROMPT_MAX_GLOSSARY_TERMS = 20;
export const AGENT_PROMPT_MAX_EXAMPLES = 2;
