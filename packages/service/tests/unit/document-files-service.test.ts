import { describe, expect, it, vi } from "vitest";
import { createDocumentFilesService } from "../../src/files/document-files-service.js";
import { isServiceErrorResult } from "../../src/service-error.js";
describe("createDocumentFilesService", () => {
  it("computes documentId from volume path", async () => {
    const files = {
      writeFile: vi.fn(async () => undefined),
      listDirectory: vi.fn(async () => []),
      deleteFile: vi.fn(async () => undefined),
    };
    const jobs = {
      findJobIdByName: vi.fn(async () => null),
      runNow: vi.fn(),
      getRun: vi.fn(),
    };
    // Container-relative volume root (Plan Fase 4): the engine-specific
    // `/Volumes/<catalog>` prefix is added by the adapter caller, not here.
    const service = createDocumentFilesService({
      catalog: "backed_gerace",
      files,
      refreshJobName: "backed_gerace-docs-refresh",
      refreshJobName: "backed-docs-refresh",
      jobs,
      maxUploadBytes: 1024,
    });
    const result = await service.upload(new Uint8Array([1, 2]), {
      filename: "report.pdf",
      folder: "contratti",
    });
    expect(isServiceErrorResult(result)).toBe(false);
    if (!isServiceErrorResult(result)) {
      expect(result.path).toBe("backed_gerace/docs/raw/contratti/report.pdf");
      expect(result.documentId).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it("rejects oversize uploads", async () => {
    const service = createDocumentFilesService({
      catalog: "backed",
      files: {
        writeFile: vi.fn(),
        listDirectory: vi.fn(async () => []),
        deleteFile: vi.fn(),
      },
      jobs: {
        findJobIdByName: vi.fn(),
        runNow: vi.fn(),
        getRun: vi.fn(),
      },
      maxUploadBytes: 1,
    });
    const result = await service.upload(new Uint8Array([1, 2]), { filename: "a.pdf" });
    expect(isServiceErrorResult(result)).toBe(true);
  });
  it("normalizes browser filenames before upload", async () => {
    const files = {
      writeFile: vi.fn(async () => undefined),
      listDirectory: vi.fn(async () => []),
      deleteFile: vi.fn(async () => undefined),
    };
    const service = createDocumentFilesService({
      catalog: "backed_gerace",
      files,
      jobs: {
        findJobIdByName: vi.fn(async () => null),
        runNow: vi.fn(),
        getRun: vi.fn(),
      },
      maxUploadBytes: 1024,
    });
    const result = await service.upload(new Uint8Array([1]), { filename: "My Report.PDF" });
    expect(isServiceErrorResult(result)).toBe(false);
    if (!isServiceErrorResult(result)) {
      expect(result.filename).toBe("my_report.pdf");
    }
  });
});
