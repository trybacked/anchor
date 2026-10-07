import { createVolumeOntologyStore, type OntologyStore } from "@trybacked/registry";
import { createFilesystemBlobStore } from "./filesystem-blob-store.js";

export function createFilesystemOntologyStore(options: {
  registryBasePath: string;
}): OntologyStore {
  const blobs = createFilesystemBlobStore(options.registryBasePath);
  return createVolumeOntologyStore(blobs, {
    root: "",
    schema: "backed",
    volume: "registry",
  });
}
