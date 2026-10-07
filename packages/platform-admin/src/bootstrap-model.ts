import type { SemanticModel } from "@trybacked/core";
import {
  buildTenantDocumentOntologyModel,
  tenantDocumentOntologyYaml,
} from "./document-ontology.js";

export function loadBootstrapModel(tenantId: string): SemanticModel {
  return buildTenantDocumentOntologyModel(tenantId);
}

export function bootstrapModelYaml(tenantId: string): string {
  return tenantDocumentOntologyYaml(tenantId);
}
