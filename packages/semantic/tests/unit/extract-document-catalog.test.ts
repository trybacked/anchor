import { describe, expect, it, vi } from "vitest";

import { runBurst } from "../../src/burst.js";
import { inferDocumentTypeHint } from "../../src/document-type-hints.js";
import { extractHeaderFields } from "../../src/extract-header-fields.js";
import { extractDocumentCatalog } from "../../src/extract-document-catalog.js";
import { SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE } from "../fixtures/document-type-hints.js";

vi.mock("../../src/burst.js", () => ({
  runBurst: vi.fn(),
}));

const mockedRunBurst = vi.mocked(runBurst);

const mockModels = {
  language: {} as never,
  embedding: {} as never,
};

describe("inferDocumentTypeHint", () => {
  it("maps determination slugs from workspace rules", () => {
    expect(
      inferDocumentTypeHint(
        "determinazioni_set_amm_n_251_2026_gen_741",
        SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE,
      )?.documentType,
    ).toBe("determination");
  });

  it("maps avviso slugs from workspace rules", () => {
    expect(
      inferDocumentTypeHint("documento_avviso_suap", SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE)?.documentType,
    ).toBe("notice");
  });

  it("returns null without workspace rules", () => {
    expect(inferDocumentTypeHint("documento_avviso_suap", undefined)).toBeNull();
    expect(inferDocumentTypeHint("documento_avviso_suap", [])).toBeNull();
  });

  it("leaves opaque PDF slugs like aspc982920 on the LLM path (not a CSV misroute)", () => {
    expect(inferDocumentTypeHint("aspc982920", SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE)).toBeNull();
  });
});

describe("extractHeaderFields", () => {
  it("extracts protocol and date from Gerace-style slugs", () => {
    const fields = extractHeaderFields(
      "prot_par_0010783_del_31_08_2026_documento_delibera_g_c_n",
      [],
    );
    expect(fields.protocolNumber).toBe("0010783");
    expect(fields.publishedDate).toBe("2026-08-31");
  });

  it("extracts determination number from slug", () => {
    const fields = extractHeaderFields("determinazioni_set_amm_n_251_2026_gen_741", []);
    expect(fields.protocolNumber).toBe("251");
  });
});

describe("extractDocumentCatalog", () => {
  it("skips LLM for documents with strong slug hints", async () => {
    mockedRunBurst.mockResolvedValue({
      output: {
        documentType: "unknown",
        documentTypeLabel: "Unknown",
        protocolNumber: null,
        publishedDate: null,
        subject: null,
        issuingOffice: null,
        confidence: 0.5,
      },
      usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
    });

    const { catalog } = await extractDocumentCatalog({
      runId: "test-run",
      models: mockModels,
      documentTypeHints: SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE,
      samples: [
        {
          sourceTable: "determinazioni_set_amm_n_251_2026_gen_741",
          headerLines: ["Determina comunale"],
          pageCount: 2,
        },
        {
          sourceTable: "documento_avviso",
          headerLines: ["AVVISO"],
          pageCount: 1,
        },
      ],
    });

    expect(mockedRunBurst).not.toHaveBeenCalled();
    expect(catalog.documents).toHaveLength(2);
    expect(catalog.documents[0]?.documentType).toBe("determination");
    expect(catalog.documents[1]?.documentType).toBe("notice");
  });

  it("calls LLM only for ambiguous documents", async () => {
    mockedRunBurst.mockResolvedValue({
      output: {
        documentType: "notice",
        documentTypeLabel: "Notice",
        protocolNumber: "123",
        publishedDate: "2026-01-15",
        subject: "Public notice",
        issuingOffice: "Municipality",
        confidence: 0.9,
      },
      usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
    });

    const { catalog } = await extractDocumentCatalog({
      runId: "test-run",
      models: mockModels,
      samples: [
        {
          sourceTable: "aspc982920",
          headerLines: ["Header"],
          pageCount: 1,
        },
      ],
    });

    expect(mockedRunBurst).toHaveBeenCalledTimes(1);
    expect(catalog.documents[0]?.protocolNumber?.value).toBe("123");
  });

  it("surfaces extraction failure with source table provenance", async () => {
    mockedRunBurst.mockRejectedValue(
      new Error('No object generated: response did not match schema'),
    );

    await expect(
      extractDocumentCatalog({
        runId: "test-run",
        models: mockModels,
        samples: [
          {
            sourceTable: "aspc982920",
            headerLines: ["Header A"],
            pageCount: 2,
          },
        ],
      }),
    ).rejects.toThrow('Document extraction failed for "aspc982920"');
  });
});
