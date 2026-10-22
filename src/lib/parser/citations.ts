import type { BrandLike } from "./mentions";
import type { ProviderCitation } from "../providers/types";

export type ParsedCitation = {
  url: string;
  domain: string;
  title?: string;
  brandId?: string;
};

const URL_RE = /https?:\/\/[^\s)\]>"']+/g;

function normalizeDomain(input: string) {
  return input
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function parseCitations(
  text: string,
  providerCitations: ProviderCitation[],
  brands: BrandLike[],
): ParsedCitation[] {
  const byUrl = new Map<string, { url: string; title?: string }>();

  const add = (url: string, title?: string) => {
    const clean = url.replace(/[.,;:!?]+$/, "");
    if (!byUrl.has(clean)) byUrl.set(clean, { url: clean, title });
  };

  for (const c of providerCitations) add(c.url, c.title);
  for (const u of text.match(URL_RE) ?? []) add(u);

  const result: ParsedCitation[] = [];
  for (const { url, title } of byUrl.values()) {
    const domain = domainOf(url);
    if (!domain) continue;
    const brand = brands.find((b) => {
      if (!b.domain) return false;
      const bd = normalizeDomain(b.domain);
      return domain === bd || domain.endsWith(`.${bd}`);
    });
    result.push({ url, domain, title, brandId: brand?.id });
  }
  return result;
}
