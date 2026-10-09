import {
  PROFILE_FK_CANDIDATES_PER_COLUMN,
  PROFILE_FK_OVERLAP_THRESHOLD,
  PROFILE_FK_SAMPLE_SIZE,
  type ColumnProfile,
  type DatasetProvider,
  type DatasetSample,
  type ForeignKeyCandidate,
  type ProfileReport,
  type TableProfile,
} from "@trybacked/core";

export type SampledTable = {
  profile: TableProfile;
  sample: DatasetSample;
};

export async function collectProfileSamples(
  provider: DatasetProvider,
  requests: readonly { table: string; datasetId: string }[],
): Promise<Map<string, DatasetSample>> {
  const samples = new Map<string, DatasetSample>();
  if (provider.sample === undefined) {
    return samples;
  }
  for (const { table, datasetId } of requests) {
    try {
      samples.set(
        table,
        await provider.sample({ id: datasetId }, { limit: PROFILE_FK_SAMPLE_SIZE }),
      );
    } catch {
    }
  }
  return samples;
}

const TYPE_FAMILIES: readonly { pattern: RegExp; family: string }[] = [
  { pattern: /^(varchar|char|text|string|uuid)/, family: "string" },
  { pattern: /^(int|integer|bigint|smallint|tinyint|long|number)/, family: "integer" },
  { pattern: /^(decimal|numeric|double|float|real)/, family: "decimal" },
  { pattern: /^(date|timestamp)/, family: "temporal" },
  { pattern: /^(bool|boolean)/, family: "boolean" },
];

function typeFamily(sqlType: string): string | undefined {
  const base = sqlType
    .toLowerCase()
    .replace(/\(.*\)$/, "")
    .trim();
  return TYPE_FAMILIES.find(({ pattern }) => pattern.test(base))?.family ?? base;
}

export function foreignKeyTypesCompatible(childType: string, parentType: string): boolean {
  return typeFamily(childType) === typeFamily(parentType);
}

export function isPrimaryKeyCandidateColumn(column: ColumnProfile, rowCount: number): boolean {
  return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount;
}

function canonicalValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const isPrimitive =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint";
  const text = isPrimitive ? String(value) : JSON.stringify(value);
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function sampledColumnValues(sample: DatasetSample, columnName: string): Set<string> {
  const index = sample.columns.indexOf(columnName);
  if (index === -1) {
    return new Set();
  }
  const values = new Set<string>();
  for (const row of sample.rows) {
    const value = canonicalValue(row[index]);
    if (value !== undefined) {
      values.add(value);
    }
  }
  return values;
}

function overlapWithParent(
  childValues: ReadonlySet<string>,
  parentValues: ReadonlySet<string>,
): number {
  if (childValues.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const value of childValues) {
    if (parentValues.has(value)) {
      hits += 1;
    }
  }
  return hits / childValues.size;
}

export function inferForeignKeyCandidates(
  child: { table: TableProfile; column: ColumnProfile; sample: DatasetSample },
  parents: readonly SampledTable[],
): ForeignKeyCandidate[] {
  const childValues = sampledColumnValues(child.sample, child.column.name);
  const candidates: ForeignKeyCandidate[] = [];
  for (const parent of parents) {
    if (parent.profile.table === child.table.table) {
      continue;
    }
    for (const column of parent.profile.columns) {
      if (!isPrimaryKeyCandidateColumn(column, parent.profile.rowCount)) {
        continue;
      }
      if (!foreignKeyTypesCompatible(child.column.sqlType, column.sqlType)) {
        continue;
      }
      const overlap = overlapWithParent(
        childValues,
        sampledColumnValues(parent.sample, column.name),
      );
      if (overlap < PROFILE_FK_OVERLAP_THRESHOLD) {
        continue;
      }
      candidates.push({
        targetTable: parent.profile.table,
        targetColumn: column.name,
        overlapRatio: overlap,
        confidence: overlap,
      });
    }
  }
  return candidates
    .sort((left, right) => right.overlapRatio - left.overlapRatio)
    .slice(0, PROFILE_FK_CANDIDATES_PER_COLUMN);
}

export function withInferredForeignKeys(
  profile: TableProfile,
  samples: ReadonlyMap<string, DatasetSample>,
  allProfiles: readonly TableProfile[],
): TableProfile {
  const childSample = samples.get(profile.table);
  if (childSample === undefined) {
    return profile;
  }
  const parents = allProfiles
    .map((other) => {
      const sample = samples.get(other.table);
      return sample === undefined ? undefined : { profile: other, sample };
    })
    .filter((parent): parent is SampledTable => parent !== undefined);
  return {
    ...profile,
    columns: profile.columns.map((column) => {
      const candidates = inferForeignKeyCandidates(
        { table: profile, column, sample: childSample },
        parents,
      );
      return candidates.length > 0 ? { ...column, foreignKeyCandidates: candidates } : column;
    }),
  };
}

export function inferProfileForeignKeys(
  profiles: readonly TableProfile[],
  samples: ReadonlyMap<string, DatasetSample>,
): ProfileReport {
  return profiles.map((profile) => withInferredForeignKeys(profile, samples, profiles));
}
