import { openrouter } from "./openrouter";
import type { Provider } from "./types";

export * from "./types";

/**
 * Pick the provider for a model id. Everything goes through OpenRouter for now.
 * Later: route "openai/...", "perplexity/..." etc. to direct adapters here.
 */
// The model id is unused until a second provider exists, but callers already pass it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getProvider(_model: string): Provider {
  return openrouter;
}
