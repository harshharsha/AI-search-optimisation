import { openrouter } from "./openrouter";
import type { Provider } from "./types";

export * from "./types";

/**
 * Pick the provider for a model id. Everything goes through OpenRouter for now.
 * Later: route "openai/...", "perplexity/..." etc. to direct adapters here.
 */
export function getProvider(_model: string): Provider {
  return openrouter;
}
