import { describe, expect, it } from "vitest";
import { resolveS3StorageConfig, s3ObjectKey } from "../../../src/adapters/s3/s3-config.js";

describe("s3 storage config", () => {
  it("uses the enrollment bucket and region when asked for the default", () => {
    const config = resolveS3StorageConfig(
      { BACKED_S3_USE_DEFAULT_BUCKET: "1" },
      "backed",
    );
    expect(config).toEqual({
      bucket: "backed-v1",
      region: "eu-north-1",
      tenantPrefix: "backed/",
    });
  });

  it("keeps an explicit bucket and region", () => {
    const config = resolveS3StorageConfig(
      { BACKED_S3_BUCKET: "other", BACKED_S3_REGION: "eu-south-1" },
      "/gerace/",
    );
    expect(config).toEqual({
      bucket: "other",
      region: "eu-south-1",
      tenantPrefix: "gerace/",
    });
  });

  it("turns a stored document path into an object key under the tenant", () => {
    expect(
      s3ObjectKey("dbfs:/Volumes/backed_gerace/docs/raw/contratti/contratto.pdf", "gerace/"),
    ).toBe("gerace/contratti/contratto.pdf");
    expect(s3ObjectKey("gerace/contratti/contratto.pdf", "gerace/")).toBe(
      "gerace/contratti/contratto.pdf",
    );
  });
});
