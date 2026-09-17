import { describe, expect, it } from "vitest";
import { buildRunUploadFormData } from "../../src/upload.js";

describe("buildRunUploadFormData upload branches", () => {
  it("accepts File instances", () => {
    const file = new File(["content"], "demo.txt", { type: "text/plain" });
    const form = buildRunUploadFormData([file]);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("accepts Blob instances", () => {
    const form = buildRunUploadFormData([new Blob(["content"])]);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("accepts binary content objects", () => {
    const form = buildRunUploadFormData([{ filename: "demo.bin", content: new ArrayBuffer(3) }]);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});
