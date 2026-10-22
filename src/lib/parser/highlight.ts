import { findMatches, type BrandLike } from "./match";

export type Segment = { text: string; brandId?: string };

/** Split an answer into plain text and brand-mention segments, for highlighting in the UI */
export function segmentAnswer(text: string, brands: BrandLike[]): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of findMatches(text, brands)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({
      text: text.slice(m.index, m.index + m.length),
      brandId: m.brandId,
    });
    last = m.index + m.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
