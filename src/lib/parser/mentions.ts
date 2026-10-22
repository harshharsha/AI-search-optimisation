import { findMatches, type BrandLike } from "./match";

export type { BrandLike } from "./match";

export type ParsedMention = {
  brandId: string;
  /** 1 = first brand mentioned in the answer */
  position: number;
  count: number;
  snippet: string;
};

function snippetAt(text: string, index: number) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function parseMentions(
  text: string,
  brands: BrandLike[],
): ParsedMention[] {
  const byBrand = new Map<string, { first: number; count: number }>();
  for (const m of findMatches(text, brands)) {
    const entry = byBrand.get(m.brandId);
    if (entry) entry.count++;
    else byBrand.set(m.brandId, { first: m.index, count: 1 });
  }

  return [...byBrand.entries()]
    .sort((a, b) => a[1].first - b[1].first)
    .map(([brandId, v], i) => ({
      brandId,
      position: i + 1,
      count: v.count,
      snippet: snippetAt(text, v.first),
    }));
}
