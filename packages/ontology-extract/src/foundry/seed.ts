import type { FoundryExtractOutput } from "./output.js";
import { defaultFoundryCatalog } from "./spec.js";

export type FoundrySeedDocument = {
  document_id: string;
  source_file: string;
  title: string;
};

export type FoundrySeedProfile = {
  normalized_name: string;
  name: string;
};

export type FoundrySeedPayload = {
  catalog: string;
  schema: "docs";
  note: string;
  documents: FoundrySeedDocument[];
  organizations: FoundrySeedProfile[];
  persons: FoundrySeedProfile[];
  legal_instruments: FoundrySeedProfile[];
  topics: FoundrySeedProfile[];
  military_assets: FoundrySeedProfile[];
  linkTypes: FoundryExtractOutput["linkTypes"];
  doubts: FoundryExtractOutput["doubts"];
};

function slugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

export function foundryExtractToSeed(
  output: FoundryExtractOutput,
  options: { ontologyId: string },
): FoundrySeedPayload {
  const catalog = defaultFoundryCatalog(options.ontologyId);
  const bucket = {
    documents: [] as FoundrySeedDocument[],
    organizations: [] as FoundrySeedProfile[],
    persons: [] as FoundrySeedProfile[],
    legal_instruments: [] as FoundrySeedProfile[],
    topics: [] as FoundrySeedProfile[],
    military_assets: [] as FoundrySeedProfile[],
  };

  for (const instance of output.instances) {
    const normalized = instance.normalizedName ?? slugFromName(instance.name);
    switch (instance.objectTypeId) {
      case "document":
        bucket.documents.push({
          document_id: normalized,
          source_file: instance.sourceFiles[0] ?? `${normalized}.pdf`,
          title: instance.name,
        });
        break;
      case "organization":
        bucket.organizations.push({ normalized_name: normalized, name: instance.name });
        break;
      case "person":
        bucket.persons.push({ normalized_name: normalized, name: instance.name });
        break;
      case "legal_instrument":
        bucket.legal_instruments.push({ normalized_name: normalized, name: instance.name });
        break;
      case "topic":
        bucket.topics.push({ normalized_name: normalized, name: instance.name });
        break;
      case "military_asset":
        bucket.military_assets.push({ normalized_name: normalized, name: instance.name });
        break;
      default: {
        const _exhaustive: never = instance.objectTypeId;
        throw new Error(`Unhandled object type: ${String(_exhaustive)}`);
      }
    }
  }

  return {
    catalog,
    schema: "docs",
    note: "Draft instances from Foundry extract (LLM). Materialize into docs.* tables before query_objects.",
    ...bucket,
    linkTypes: output.linkTypes,
    doubts: output.doubts,
  };
}
