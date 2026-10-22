import { lookup } from "node:dns/promises";
import { safeFetch } from "./audit/safe-fetch";
import { getProvider } from "./providers";

export type Discovery =
  | {
      ok: true;
      category: string;
      competitors: { name: string; domain: string | null }[];
      prompts: string[];
    }
  | { ok: false; error: string };

const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/;

const cleanDomain = (d: string) =>
  d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A short description of what the site says about itself, to ground the model */
async function siteSummary(domain: string): Promise<string> {
  try {
    const res = await safeFetch(`https://${domain}`, {
      maxBytes: 600_000,
      timeoutMs: 6000,
    });
    const html = res.body;
    const title = stripTags(
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
    );
    const description =
      html.match(
        /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
      )?.[1] ??
      html.match(
        /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
      )?.[1] ??
      "";
    const headings = [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean)
      .slice(0, 6);
    const text = stripTags(
      html
        .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " "),
    ).slice(0, 1200);
    return [
      title && `Title: ${title}`,
      description && `Description: ${description}`,
      headings.length && `Headings: ${headings.join(" | ")}`,
      text && `Page text: ${text}`,
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function parseJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Work out a brand's category, its five closest competitors, and questions customers ask AI.
 * The model's answer is a starting point: it is validated, and websites that do not resolve are dropped.
 */
export async function discoverMarket(input: {
  brandName: string;
  website: string;
  model: string;
}): Promise<Discovery> {
  const brandName = input.brandName.trim();
  const ownDomain = cleanDomain(input.website);
  const model = input.model.trim();

  if (!brandName) return { ok: false, error: "Enter the brand name first." };
  if (!model) return { ok: false, error: "Add a model first." };

  const summary = ownDomain ? await siteSummary(ownDomain) : "";

  const prompt = [
    "You are a market analyst.",
    "",
    `Brand: ${brandName}${ownDomain ? ` (${ownDomain})` : ""}`,
    summary ? `What the brand's homepage says:\n${summary}` : "",
    "",
    "Task: identify the product category, the five closest direct competitors that customers compare this brand against, and eight questions that potential customers would ask an AI assistant when choosing in this category.",
    "",
    "Return only JSON, with no prose and no code fences, in exactly this shape:",
    '{"category":"short description of the category","competitors":[{"name":"Company","website":"example.com"}],"prompts":["question"]}',
    "",
    "Rules:",
    "- Exactly five competitors. Real companies that operate today. If you are not sure a company exists or you do not know its website, leave it out instead of guessing.",
    "- Do not include the brand itself among the competitors.",
    "- Prompts are natural questions, mixing 'best X for Y', 'alternatives to <competitor>', 'X vs Y', and problem-led questions.",
    "- At most two prompts may name a brand. All the others must not name any brand, so they measure organic visibility.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const result = await getProvider(model)
    .run(model, prompt)
    .catch((e: unknown) =>
      e instanceof Error ? e : new Error("The model did not answer"),
    );
  if (result instanceof Error) return { ok: false, error: result.message };

  const data = parseJson(result.text) as {
    category?: unknown;
    competitors?: unknown;
    prompts?: unknown;
  } | null;
  if (!data) {
    return {
      ok: false,
      error:
        "The model did not return a usable list. Try again, or use a model with web search (:online).",
    };
  }

  const seen = new Set([brandName.toLowerCase()]);
  const candidates: { name: string; domain: string | null }[] = [];
  for (const c of Array.isArray(data.competitors) ? data.competitors : []) {
    const obj = (typeof c === "object" && c !== null ? c : {}) as Record<
      string,
      unknown
    >;
    const name = (
      typeof c === "string" ? c : typeof obj.name === "string" ? obj.name : ""
    ).trim();
    const rawSite =
      typeof obj.website === "string"
        ? obj.website
        : typeof obj.domain === "string"
          ? obj.domain
          : "";
    const domain = cleanDomain(rawSite);
    if (
      !name ||
      seen.has(name.toLowerCase()) ||
      (domain && domain === ownDomain)
    )
      continue;
    seen.add(name.toLowerCase());
    candidates.push({ name, domain: DOMAIN_RE.test(domain) ? domain : null });
    if (candidates.length >= 5) break;
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        "The model did not name any competitors. Try again, or use a model with web search (:online).",
    };
  }

  // Drop websites that do not exist, a common sign of a guessed domain
  const competitors = await Promise.all(
    candidates.map(async (c) => {
      if (!c.domain) return c;
      try {
        await lookup(c.domain);
        return c;
      } catch {
        return { ...c, domain: null };
      }
    }),
  );

  const prompts: string[] = [];
  for (const p of Array.isArray(data.prompts) ? data.prompts : []) {
    if (typeof p !== "string") continue;
    const t = p.trim();
    if (
      t.length < 12 ||
      t.length > 200 ||
      prompts.some((x) => x.toLowerCase() === t.toLowerCase())
    )
      continue;
    prompts.push(t);
    if (prompts.length >= 10) break;
  }

  return {
    ok: true,
    category:
      typeof data.category === "string" && data.category.trim()
        ? data.category.trim()
        : "your market",
    competitors,
    prompts,
  };
}
