import { z } from "zod";
import { PublicationRecordSchema, type PublicationRecord } from "./publication.js";
export const RemotePublicationSchema = PublicationRecordSchema.extend({
  modelYaml: z.string().min(1),
});
export type RemotePublication = z.infer<typeof RemotePublicationSchema>;
export type BlobStoreWriteOptions = {
  overwrite?: boolean | undefined;
};
export type BlobStore = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string, options?: BlobStoreWriteOptions) => Promise<void>;
};
export type OntologyStore = {
  loadCurrent: (catalog: string) => Promise<RemotePublication | null>;
  publish: (catalog: string, record: PublicationRecord, modelYaml: string) => Promise<void>;
};
export type VolumeOntologyRoot = {
  /** Absolute engine-specific root (e.g. a UC volume path or a bucket prefix). */
  root: string;
  schema: string;
  volume: string;
};
function registryBase(catalog: string, layout: VolumeOntologyRoot): string {
  return `${layout.root}/${catalog}/${layout.schema}/${layout.volume}`;
}
function currentPath(catalog: string, layout: VolumeOntologyRoot): string {
  return `${registryBase(catalog, layout)}/current.json`;
}
function versionPath(catalog: string, version: number, layout: VolumeOntologyRoot): string {
  return `${registryBase(catalog, layout)}/publications/v${String(version)}.json`;
}
/**
 * Volume-rooted registry store. The engine-specific root is resolved by the
 * adapter (Plan Fase 3b) — the registry package stays storage-agnostic.
 */
export function createVolumeOntologyStore(
  blobs: BlobStore,
  layout: VolumeOntologyRoot,
): OntologyStore {
  return {
    loadCurrent: async (catalog) => {
      const raw = await blobs.read(currentPath(catalog, layout));
      if (raw === null) {
        return null;
      }
      return RemotePublicationSchema.parse(JSON.parse(raw));
    },
    publish: async (catalog, record, modelYaml) => {
      const remote: RemotePublication = RemotePublicationSchema.parse({
        ...record,
        modelYaml,
      });
      const payload = `${JSON.stringify(remote, null, 2)}\n`;
      await blobs.write(versionPath(catalog, record.version, layout), payload, {
        overwrite: false,
      });
      await blobs.write(currentPath(catalog, layout), payload, { overwrite: true });
    },
  };
}
