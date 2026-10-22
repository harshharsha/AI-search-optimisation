import { ProviderError, type Provider, type ProviderCitation } from "./types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterResponse = {
  error?: { message?: string; code?: number | string };
  choices?: {
    message?: {
      content?: string | null;
      annotations?: {
        type: string;
        url_citation?: { url: string; title?: string };
      }[];
    };
  }[];
  /** Perplexity models return plain URLs here */
  citations?: string[];
};

export const openrouter: Provider = {
  id: "openrouter",

  async run(model, prompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new ProviderError("OPENROUTER_API_KEY is not set");

    const started = Date.now();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "aisoa",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = (await res.json().catch(() => ({}))) as OpenRouterResponse;

    // OpenRouter can return an error body even with a 200 status
    if (!res.ok || json.error) {
      const status = res.ok ? Number(json.error?.code) || 500 : res.status;
      throw new ProviderError(
        json.error?.message ?? `OpenRouter request failed (${res.status})`,
        status,
      );
    }

    const message = json.choices?.[0]?.message;
    const text = message?.content?.trim() ?? "";
    if (!text) throw new ProviderError("Model returned an empty answer");

    const citations: ProviderCitation[] = [];
    for (const url of json.citations ?? []) citations.push({ url });
    for (const a of message?.annotations ?? []) {
      if (a.type === "url_citation" && a.url_citation?.url) {
        citations.push({
          url: a.url_citation.url,
          title: a.url_citation.title,
        });
      }
    }

    return { text, citations, latencyMs: Date.now() - started };
  },
};
