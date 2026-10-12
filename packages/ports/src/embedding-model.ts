export type EmbeddingModel = {
  modelId: string;
  dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
};
