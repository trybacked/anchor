import { z } from "zod";
const SLUG_ID_PATTERN = /^[a-z0-9_]+$/;
const MIN_LANGUAGE_CODE_LENGTH = 2;
const IDENTIFIER_LENGTH_MAX = 64;
export const DomainTermSchema = z.object({
    id: z
        .string()
        .min(1)
        .regex(SLUG_ID_PATTERN, "Term ids are lowercase slugs"),
    label: z.string().min(1),
    description: z.string().min(1),
});
export const FactTypeSchema = z.object({
    id: z
        .string()
        .min(1)
        .regex(SLUG_ID_PATTERN, "Fact type ids are lowercase slugs"),
    label: z.string().min(1),
    quantity: z.enum(["currency", "percentage", "count", "duration"]),
    cues: z.array(z.string().min(1)).min(1),
    aggregation: z.enum(["sum", "max", "min", "avg"]),
    isDefault: z.boolean(),
});
export const IdentifierFormatSchema = z.object({
    id: z
        .string()
        .min(1)
        .regex(SLUG_ID_PATTERN, "Identifier ids are lowercase slugs"),
    label: z.string().min(1),
    cues: z.array(z.string().min(1)).min(1),
    charset: z.enum(["alphanumeric", "numeric", "alphanumeric_dash"]),
    minLength: z.number().int().min(1).max(IDENTIFIER_LENGTH_MAX),
    maxLength: z.number().int().min(1).max(IDENTIFIER_LENGTH_MAX),
});
export const NameConventionSchema = z.object({
    suffixes: z.array(z.string().min(1)),
    leadingNoise: z.array(z.string().min(1)),
});
export const NUMBER_FORMATS = ["decimal_comma", "decimal_point"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];
export const DATE_ORDERS = ["day_first", "month_first", "year_first"] as const;
export type DateOrder = (typeof DATE_ORDERS)[number];
export const DomainVocabularySchema = z.object({
    language: z.string().min(MIN_LANGUAGE_CODE_LENGTH),
    numberFormat: z.enum(NUMBER_FORMATS),
    dateOrder: z.enum(DATE_ORDERS),
    corpusSummary: z.string().min(1),
    entityLabel: z.string().min(1),
    documentTopics: z.array(DomainTermSchema),
    entitySectors: z.array(DomainTermSchema),
    entityRoles: z.array(DomainTermSchema),
    factTypes: z.array(FactTypeSchema),
    identifierFormats: z.array(IdentifierFormatSchema),
    nameConventions: NameConventionSchema,
});
export type DomainTerm = z.infer<typeof DomainTermSchema>;
export type FactType = z.infer<typeof FactTypeSchema>;
export type IdentifierFormat = z.infer<typeof IdentifierFormatSchema>;
export type NameConvention = z.infer<typeof NameConventionSchema>;
export type DomainVocabulary = z.infer<typeof DomainVocabularySchema>;
export const EMPTY_DOMAIN_VOCABULARY: DomainVocabulary = {
    language: "en",
    numberFormat: "decimal_point",
    dateOrder: "year_first",
    corpusSummary: "Unclassified document corpus",
    entityLabel: "entity",
    documentTopics: [],
    entitySectors: [],
    entityRoles: [],
    factTypes: [],
    identifierFormats: [],
    nameConventions: { suffixes: [], leadingNoise: [] },
};
export function termIds(terms: DomainTerm[]): string[] {
    return terms.map((term) => term.id);
}
export function describeTerms(terms: DomainTerm[]): string {
    return terms.map((term) => `- ${term.id}: ${term.description}`).join("\n");
}
export type DomainVocabularyOverrides = {
    [K in keyof DomainVocabulary]?: DomainVocabulary[K] | undefined;
};
export function mergeVocabulary(discovered: DomainVocabulary, overrides: DomainVocabularyOverrides | undefined): DomainVocabulary {
    if (overrides === undefined) {
        return discovered;
    }
    return DomainVocabularySchema.parse({ ...discovered, ...overrides });
}
