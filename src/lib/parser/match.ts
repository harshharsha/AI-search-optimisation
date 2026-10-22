export type BrandLike = {
  id: string;
  name: string;
  aliases: string[];
  domain?: string | null;
};

export type Match = { brandId: string; index: number; length: number };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function boundaryRegex(terms: string[], flags: string) {
  const names = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  if (names.length === 0) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${names.join("|")})(?![\\p{L}\\p{N}])`,
    flags,
  );
}

/**
 * Find every brand mention in a text.
 * - The brand name must match exactly as written (Linear does not match "linear").
 * - Aliases match without regard to case, so users can add variants on purpose.
 * Overlapping matches are dropped, keeping the longest.
 */
export function findMatches(text: string, brands: BrandLike[]): Match[] {
  const all: Match[] = [];

  const collect = (brandId: string, terms: string[], flags: string) => {
    const re = boundaryRegex(terms, flags);
    if (!re) return;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)))
      all.push({ brandId, index: m.index, length: m[0].length });
  };

  for (const b of brands) {
    collect(b.id, [b.name], "gu");
    collect(b.id, b.aliases, "giu");
  }

  all.sort((a, b) => a.index - b.index || b.length - a.length);

  const out: Match[] = [];
  let end = -1;
  for (const m of all) {
    if (m.index < end) continue;
    out.push(m);
    end = m.index + m.length;
  }
  return out;
}
