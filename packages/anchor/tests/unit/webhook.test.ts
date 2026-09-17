import { describe, expect, it } from "vitest";
import { AnchorWebhookError } from "../../src/errors.js";
import {
  parseRunCompletedWebhook,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../../src/webhook/index.js";

describe("parseRunCompletedWebhook", () => {
  const validBody = JSON.stringify({
    event: "run.completed",
    tenantId: "demo",
    runId: "run-1",
    status: "done",
    skipped: false,
  });

  it("parses valid payloads", () => {
    expect(parseRunCompletedWebhook(validBody)).toEqual({
      event: "run.completed",
      tenantId: "demo",
      runId: "run-1",
      status: "done",
      skipped: false,
    });
  });

  it("rejects malformed JSON", () => {
    expect(() => parseRunCompletedWebhook("{")).toThrow(AnchorWebhookError);
  });

  it("rejects unexpected events", () => {
    expect(() =>
      parseRunCompletedWebhook(
        JSON.stringify({ event: "run.started", tenantId: "demo", runId: "run-1" }),
      ),
    ).toThrow(/Unexpected webhook event/);
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseRunCompletedWebhook(JSON.stringify({ event: "run.completed", tenantId: "demo" })),
    ).toThrow(/missing runId/);
  });

  it("accepts optional modelEtag and deletionEntry", () => {
    expect(
      parseRunCompletedWebhook(
        JSON.stringify({
          event: "run.completed",
          tenantId: "demo",
          runId: "run-1",
          status: "done",
          skipped: false,
          modelEtag: '"etag-1"',
          deletionEntry: {
            runId: "run-1",
            tenantId: "demo",
            deletedAt: "2026-01-01T00:00:00.000Z",
            filesDeleted: 2,
            bytesDeleted: 1024,
          },
        }),
      ),
    ).toMatchObject({
      modelEtag: '"etag-1"',
      deletionEntry: {
        filesDeleted: 2,
        bytesDeleted: 1024,
      },
    });
  });

  it("rejects invalid deletionEntry payloads", () => {
    expect(() =>
      parseRunCompletedWebhook(
        JSON.stringify({
          event: "run.completed",
          tenantId: "demo",
          runId: "run-1",
          status: "failed",
          skipped: true,
          deletionEntry: { filesDeleted: 1 },
        }),
      ),
    ).toThrow(AnchorWebhookError);
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies signatures produced by signWebhookPayload", () => {
    const body = JSON.stringify({ event: "run.completed", tenantId: "demo", runId: "run-1" });
    const signature = signWebhookPayload(body, "whsec_test");
    expect(verifyWebhookSignature(body, "whsec_test", signature)).toBe(true);
    expect(verifyWebhookSignature(body, "whsec_test", "invalid")).toBe(false);
  });

  it("rejects signatures with different length", () => {
    const body = "{}";
    expect(verifyWebhookSignature(body, "secret", "short")).toBe(false);
  });
});
