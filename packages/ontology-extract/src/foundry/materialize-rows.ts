import type { FoundryExtractOutput } from "./output.js";
import type { FoundrySeedPayload } from "./seed.js";
import { FOUNDRY_EXTRACT_OBJECT_TYPE_IDS, type FoundryExtractObjectTypeId } from "./spec.js";

export type FoundryMaterializeTableRows = Record<string, Record<string, unknown>[]>;

function documentIdBySourceFile(seed: FoundrySeedPayload): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of seed.documents) {
    map.set(doc.source_file, doc.document_id);
    const base = doc.source_file.split("/").pop();
    if (base !== undefined && base.length > 0) {
      map.set(base, doc.document_id);
    }
  }
  return map;
}

function resolveDocumentId(sourceFile: string, fileToDoc: Map<string, string>): string | undefined {
  const direct = fileToDoc.get(sourceFile);
  if (direct !== undefined) {
    return direct;
  }
  const normalized = sourceFile.replace(/^\/+/, "");
  const directNormalized = fileToDoc.get(normalized);
  if (directNormalized !== undefined) {
    return directNormalized;
  }
  const fileBase = normalized.split("/").pop()?.toLowerCase();
  if (fileBase === undefined || fileBase.length === 0) {
    return undefined;
  }
  for (const [key, id] of fileToDoc) {
    const keyBase = key.split("/").pop()?.toLowerCase();
    if (keyBase === fileBase) {
      return id;
    }
  }
  return undefined;
}

function slugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function profileRow(
  normalized: string,
  name: string,
  entityType: string,
  documentIds: string[],
): Record<string, unknown> {
  const first = documentIds[0] ?? null;
  const last = documentIds[documentIds.length - 1] ?? null;
  return {
    normalized_name: normalized,
    name,
    entity_type: entityType,
    mention_count: documentIds.length,
    first_seen_document_id: first,
    last_seen_document_id: last,
  };
}

function mentionId(prefix: string, index: number): string {
  return `${prefix}_${String(index)}`;
}

export function buildFoundryTableRows(
  output: FoundryExtractOutput,
  seed: FoundrySeedPayload,
): FoundryMaterializeTableRows {
  const fileToDoc = documentIdBySourceFile(seed);

  const documents = seed.documents.map((doc) => ({
    document_id: doc.document_id,
    source_file: doc.source_file,
    title: doc.title,
  }));

  const orgRows: Record<string, unknown>[] = [];
  const personRows: Record<string, unknown>[] = [];
  const legalRows: Record<string, unknown>[] = [];
  const topicRows: Record<string, unknown>[] = [];
  const assetRows: Record<string, unknown>[] = [];

  const docOrgMentions: Record<string, unknown>[] = [];
  const docPersonMentions: Record<string, unknown>[] = [];
  const docTopicMentions: Record<string, unknown>[] = [];
  const docLegalMentions: Record<string, unknown>[] = [];

  let mentionIndex = 0;

  const extractTypeIds = new Set<string>(FOUNDRY_EXTRACT_OBJECT_TYPE_IDS);

  for (const instance of output.instances) {
    if (!extractTypeIds.has(instance.objectTypeId)) {
      continue;
    }
    const normalized = instance.normalizedName ?? slugFromName(instance.name);
    const docIds = instance.sourceFiles
      .flatMap((file) => {
        const id = resolveDocumentId(file, fileToDoc);
        return id !== undefined ? [id] : [];
      })
      .filter((id, index, all) => all.indexOf(id) === index);

    switch (instance.objectTypeId) {
      case "organization":
        orgRows.push(profileRow(normalized, instance.name, "ORG", docIds));
        for (const docId of docIds) {
          docOrgMentions.push({
            mention_id: mentionId("doc_org", mentionIndex++),
            document_id: docId,
            organization_normalized_name: normalized,
          });
        }
        break;
      case "person":
        personRows.push(profileRow(normalized, instance.name, "PERSON", docIds));
        for (const docId of docIds) {
          docPersonMentions.push({
            mention_id: mentionId("doc_person", mentionIndex++),
            document_id: docId,
            person_normalized_name: normalized,
          });
        }
        break;
      case "legal_instrument":
        legalRows.push(profileRow(normalized, instance.name, "LAW", docIds));
        for (const docId of docIds) {
          docLegalMentions.push({
            mention_id: mentionId("doc_legal", mentionIndex++),
            document_id: docId,
            legal_instrument_normalized_name: normalized,
          });
        }
        break;
      case "topic":
        topicRows.push(profileRow(normalized, instance.name, "TOPIC", docIds));
        for (const docId of docIds) {
          docTopicMentions.push({
            mention_id: mentionId("doc_topic", mentionIndex++),
            document_id: docId,
            topic_normalized_name: normalized,
          });
        }
        break;
      case "military_asset":
        assetRows.push(profileRow(normalized, instance.name, "ASSET", docIds));
        break;
      case "document":
        break;
    }
  }

  const affiliations: Record<string, unknown>[] = [];
  const persons = output.instances.filter((entry) => entry.objectTypeId === "person");
  const orgs = output.instances.filter((entry) => entry.objectTypeId === "organization");
  let affIndex = 0;
  for (const person of persons) {
    for (const org of orgs) {
      const shared = person.sourceFiles.filter((file) => org.sourceFiles.includes(file));
      if (shared.length === 0) {
        continue;
      }
      affiliations.push({
        affiliation_id: mentionId("aff", affIndex++),
        person_normalized_name: person.normalizedName ?? slugFromName(person.name),
        organization_normalized_name: org.normalizedName ?? slugFromName(org.name),
        co_document_count: shared.length,
      });
    }
  }

  return buildRowPayload({
    documents,
    organization_profiles: orgRows,
    person_profiles: personRows,
    legal_instrument_profiles: legalRows,
    topic_profiles: topicRows,
    military_asset_profiles: assetRows,
    document_organization_mentions: docOrgMentions,
    document_person_mentions: docPersonMentions,
    document_topic_mentions: docTopicMentions,
    document_legal_instrument_mentions: docLegalMentions,
    person_organization_affiliations: affiliations,
  });
}

function buildRowPayload(partial: FoundryMaterializeTableRows): FoundryMaterializeTableRows {
  return partial;
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split("_").filter((part) => part.length > 2));
  const tokensB = new Set(b.split("_").filter((part) => part.length > 2));
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function sourceFilesForProfile(
  normalizedName: string,
  documents: FoundrySeedPayload["documents"],
): string[] {
  let best: { file: string; score: number } | undefined;
  for (const doc of documents) {
    const score = Math.max(
      tokenOverlap(normalizedName, doc.document_id),
      tokenOverlap(normalizedName, slugFromName(doc.title)),
    );
    if (score === 0) {
      continue;
    }
    if (best === undefined || score > best.score) {
      best = { file: doc.source_file, score };
    }
  }
  return best !== undefined ? [best.file] : documents.map((doc) => doc.source_file);
}

/** When no LLM extract artifact exists, infer document links from seed slugs (pilot / review flows). */
export function synthesizeFoundryExtractFromSeed(seed: FoundrySeedPayload): FoundryExtractOutput {
  const instances: FoundryExtractOutput["instances"] = [];
  for (const doc of seed.documents) {
    instances.push({
      objectTypeId: "document",
      name: doc.title,
      normalizedName: doc.document_id,
      sourceFiles: [doc.source_file],
      evidence: "seed document row",
    });
  }
  const profileRows: Array<{
    objectTypeId: FoundryExtractObjectTypeId;
    rows: Array<{ normalized_name: string; name: string }>;
  }> = [
    { objectTypeId: "organization", rows: seed.organizations },
    { objectTypeId: "person", rows: seed.persons },
    { objectTypeId: "legal_instrument", rows: seed.legal_instruments },
    { objectTypeId: "topic", rows: seed.topics },
    { objectTypeId: "military_asset", rows: seed.military_assets },
  ];
  for (const group of profileRows) {
    for (const row of group.rows) {
      instances.push({
        objectTypeId: group.objectTypeId,
        name: row.name,
        normalizedName: row.normalized_name,
        sourceFiles: sourceFilesForProfile(row.normalized_name, seed.documents),
        evidence: "seed profile row (heuristic document link)",
      });
    }
  }
  return {
    locale: "it",
    instances,
    linkTypes: seed.linkTypes ?? [],
    doubts: seed.doubts ?? [],
  };
}
