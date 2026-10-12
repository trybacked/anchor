export type ArtifactRef = {
  key: string;
  sha256: string;
  byteLength: number;
};

export type ArtifactStore = {
  read(key: string): Promise<Buffer | null>;
  write(key: string, bytes: Buffer): Promise<ArtifactRef>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
};
