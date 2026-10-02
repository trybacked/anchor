import { z } from "zod";
import { PublicationRecordSchema, type PublicationRecord } from "./publication.js";

export const RemotePublicationSchema = PublicationRecordSchema.extend({
  modelYaml: z.string().min(1),
});

export type RemotePublication = z.infer<typeof RemotePublicationSchema>;

export type BlobStore = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string) => Promise<void>;
};

export type VolumeOntologyLayout = {
  schema: string;
  volume: string;
};

export type OntologyStore = {
  loadCurrent: (catalog: string) => Promise<RemotePublication | null>;
  publish: (catalog: string, record: PublicationRecord, modelYaml: string) => Promise<void>;
};

const DEFAULT_LAYOUT: VolumeOntologyLayout = {
  schema: "backed",
  volume: "registry",
};

function registryBase(catalog: string, layout: VolumeOntologyLayout): string {
  return `/Volumes/${catalog}/${layout.schema}/${layout.volume}`;
}

function currentPath(catalog: string, layout: VolumeOntologyLayout): string {
  return `${registryBase(catalog, layout)}/current.json`;
}

function versionPath(catalog: string, version: number, layout: VolumeOntologyLayout): string {
  return `${registryBase(catalog, layout)}/publications/v${String(version)}.json`;
}

export function createVolumeOntologyStore(
  blobs: BlobStore,
  layout: VolumeOntologyLayout = DEFAULT_LAYOUT,
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
      await blobs.write(versionPath(catalog, record.version, layout), payload);
      await blobs.write(currentPath(catalog, layout), payload);
    },
  };
}
