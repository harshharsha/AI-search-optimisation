export type ProviderCitation = { url: string; title?: string };

export type ProviderResult = {
  text: string;
  citations: ProviderCitation[];
  latencyMs: number;
};

export interface Provider {
  id: string;
  run(model: string, prompt: string): Promise<ProviderResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
