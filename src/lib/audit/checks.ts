import { safeFetch, type FetchResult } from "./safe-fetch";
import { isBlocked, parseRobots } from "./robots";

export type CheckStatus = "pass" | "warn" | "fail";
export type Impact = "high" | "medium" | "low";
export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  impact: Impact;
  detail: string;
  fix?: string;
};

const WEIGHT: Record<Impact, number> = { high: 3, medium: 2, low: 1 };
const VALUE: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

export function scoreChecks(checks: Check[]) {
  const total = checks.reduce((n, c) => n + WEIGHT[c.impact], 0);
  const got = checks.reduce(
    (n, c) => n + WEIGHT[c.impact] * VALUE[c.status],
    0,
  );
  return total ? Math.round((got / total) * 100) : 0;
}

// Crawlers that fetch pages to answer questions (blocking them hurts visibility)
const RETRIEVAL_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "Googlebot",
  "Bingbot",
];
// Crawlers used for model training (blocking them is a policy choice)
const TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
];

// ---------- small HTML helpers (no dependency) ----------
const attrsOf = (s: string) => {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
  )) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
};
const tagsOf = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((m) =>
    attrsOf(m[1]),
  );
const metaContent = (html: string, key: string) =>
  tagsOf(html, "meta")
    .find((a) => (a.name ?? a.property ?? "").toLowerCase() === key)
    ?.content?.trim();
const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Some headings repeat their text (animations, screen-reader copies). Collapse "A A A" to "A". */
const collapseRepeat = (s: string) =>
  s.length < 400 ? (s.match(/^(.{8,}?)(?:\s+\1)+$/)?.[1] ?? s) : s;
const visibleText = (html: string) =>
  stripTags(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/&nbsp;|&#?\w+;/g, " "),
  );

function jsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const t = obj["@type"];
      if (typeof t === "string") types.add(t);
      else if (Array.isArray(t))
        t.forEach((x) => typeof x === "string" && types.add(x));
      Object.values(obj).forEach(visit);
    }
  };
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return [...types];
}

const PAGE_TYPES: [string, RegExp][] = [
  ["pricing", /pricing|plans/],
  ["FAQ or help", /faq|help|support/],
  [
    "comparisons or alternatives",
    /compare|comparison|\/vs[-/]|-vs-|alternative/,
  ],
  ["blog or guides", /blog|guide|learn|resources|articles/],
  ["docs", /docs|documentation/],
  ["about", /about|company/],
];

const looksLikeText = (r: FetchResult | null) =>
  !!r &&
  r.status === 200 &&
  !/^\s*<(!doctype|html)/i.test(r.body) &&
  r.body.trim().length > 0;

export async function runSiteAudit(siteUrl: string, brandName: string) {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  let home: FetchResult;
  try {
    home = await safeFetch(siteUrl);
  } catch (e) {
    add({
      id: "reachable",
      label: "Website loads",
      status: "fail",
      impact: "high",
      detail: e instanceof Error ? e.message : "The site could not be fetched.",
      fix: "Check the website address on the brand, and that the site is public and online.",
    });
    return { score: 0, checks, finalUrl: siteUrl };
  }

  const html = home.body;
  const origin = new URL(home.url).origin;

  if (home.status < 200 || home.status >= 300) {
    add({
      id: "reachable",
      label: "Website loads",
      status: "fail",
      impact: "high",
      detail: `The homepage answered with status ${home.status}.`,
      fix: "Make sure the homepage returns a normal 200 response to automated visitors.",
    });
    return { score: scoreChecks(checks), checks, finalUrl: home.url };
  }
  add({
    id: "reachable",
    label: "Website loads",
    status: "pass",
    impact: "high",
    detail: `The homepage loaded (status ${home.status}).`,
  });

  add(
    new URL(home.url).protocol === "https:"
      ? {
          id: "https",
          label: "Served over HTTPS",
          status: "pass",
          impact: "medium",
          detail: "The site uses HTTPS.",
        }
      : {
          id: "https",
          label: "Served over HTTPS",
          status: "fail",
          impact: "medium",
          detail: "The site is served over plain HTTP.",
          fix: "Install a certificate and redirect all HTTP traffic to HTTPS.",
        },
  );

  const robotsMeta = (metaContent(html, "robots") ?? "").toLowerCase();
  const headerRobots = (home.headers.get("x-robots-tag") ?? "").toLowerCase();
  add(
    robotsMeta.includes("noindex") || headerRobots.includes("noindex")
      ? {
          id: "noindex",
          label: "Homepage can be indexed",
          status: "fail",
          impact: "high",
          detail: "The homepage tells crawlers not to index it (noindex).",
          fix: "Remove the noindex directive from the meta robots tag or the X-Robots-Tag header.",
        }
      : {
          id: "noindex",
          label: "Homepage can be indexed",
          status: "pass",
          impact: "high",
          detail: "No noindex directive found.",
        },
  );

  const [robotsRes, sitemapRes, llmsRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, { maxBytes: 300_000 }).catch(() => null),
    safeFetch(`${origin}/sitemap.xml`, { maxBytes: 300_000 }).catch(() => null),
    safeFetch(`${origin}/llms.txt`, { maxBytes: 300_000 }).catch(() => null),
  ]);

  // robots.txt and AI crawler access
  const robotsText = looksLikeText(robotsRes) ? robotsRes!.body : null;
  const robots = robotsText
    ? parseRobots(robotsText)
    : { groups: [], sitemaps: [] };
  const blockedRetrieval = RETRIEVAL_BOTS.filter((b) => isBlocked(robots, b));
  const blockedTraining = TRAINING_BOTS.filter((b) => isBlocked(robots, b));

  add(
    blockedRetrieval.length > 0
      ? {
          id: "ai-crawlers",
          label: "AI search crawlers are allowed",
          status: "fail",
          impact: "high",
          detail: `robots.txt blocks: ${blockedRetrieval.join(", ")}. These crawlers fetch pages to answer questions.`,
          fix: "Remove the Disallow rules for these crawlers in robots.txt, and check that your firewall or CDN bot protection is not blocking them either.",
        }
      : {
          id: "ai-crawlers",
          label: "AI search crawlers are allowed",
          status: "pass",
          impact: "high",
          detail:
            blockedTraining.length > 0
              ? `Search crawlers are allowed. Training crawlers blocked: ${blockedTraining.join(", ")}. That is a policy choice and does not stop AI search from citing you.`
              : "robots.txt does not block the major AI search or training crawlers.",
        },
  );

  add(
    robotsText
      ? {
          id: "robots",
          label: "robots.txt present",
          status: "pass",
          impact: "low",
          detail: "robots.txt was found.",
        }
      : {
          id: "robots",
          label: "robots.txt present",
          status: "warn",
          impact: "low",
          detail:
            "No robots.txt found. Crawlers are allowed by default, but you cannot point them to your sitemap.",
          fix: "Add a robots.txt that allows crawling and lists your sitemap.",
        },
  );

  const sitemapValid =
    !!sitemapRes &&
    sitemapRes.status === 200 &&
    /<(urlset|sitemapindex)\b/i.test(sitemapRes.body);
  add(
    sitemapValid || robots.sitemaps.length > 0
      ? {
          id: "sitemap",
          label: "XML sitemap",
          status: "pass",
          impact: "medium",
          detail: "A sitemap was found.",
        }
      : {
          id: "sitemap",
          label: "XML sitemap",
          status: "warn",
          impact: "medium",
          detail: "No sitemap found at /sitemap.xml or in robots.txt.",
          fix: "Publish a sitemap.xml listing your important pages and reference it in robots.txt.",
        },
  );

  add(
    looksLikeText(llmsRes)
      ? {
          id: "llms",
          label: "llms.txt",
          status: "pass",
          impact: "low",
          detail: "An llms.txt file was found.",
        }
      : {
          id: "llms",
          label: "llms.txt",
          status: "warn",
          impact: "low",
          detail:
            "No llms.txt found. This is an emerging convention and its effect on AI answers is unproven.",
          fix: "Optional: add a short /llms.txt that describes the company and links to key pages.",
        },
  );

  // Page basics
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  add(
    title.length >= 10 && title.length <= 70
      ? {
          id: "title",
          label: "Page title",
          status: "pass",
          impact: "medium",
          detail: `Title: "${title}"`,
        }
      : {
          id: "title",
          label: "Page title",
          status: title ? "warn" : "fail",
          impact: "medium",
          detail: title
            ? `The title is ${title.length} characters: "${title}"`
            : "The homepage has no title tag.",
          fix: "Write a clear title of 10 to 70 characters that says what the company does.",
        },
  );

  const description = metaContent(html, "description") ?? "";
  add(
    description.length >= 50
      ? {
          id: "description",
          label: "Meta description",
          status: "pass",
          impact: "low",
          detail: "A meta description is set.",
        }
      : {
          id: "description",
          label: "Meta description",
          status: description ? "warn" : "fail",
          impact: "low",
          detail: description
            ? "The meta description is very short."
            : "No meta description found.",
          fix: "Add a one or two sentence meta description that states what the company does and for whom.",
        },
  );

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    collapseRepeat(stripTags(m[1])),
  );
  add(
    h1s.length === 1
      ? {
          id: "h1",
          label: "One main heading (H1)",
          status: "pass",
          impact: "medium",
          detail: `H1: "${h1s[0]}"`,
        }
      : {
          id: "h1",
          label: "One main heading (H1)",
          status: h1s.length === 0 ? "fail" : "warn",
          impact: "medium",
          detail:
            h1s.length === 0
              ? "No H1 heading found."
              : `${h1s.length} H1 headings found.`,
          fix: "Use exactly one H1 that states what the page or company is about.",
        },
  );

  const name = brandName.toLowerCase();
  const nameInPage =
    title.toLowerCase().includes(name) ||
    h1s.some((h) => h.toLowerCase().includes(name));
  add(
    nameInPage
      ? {
          id: "brand-name",
          label: "Brand name in title or heading",
          status: "pass",
          impact: "medium",
          detail: `"${brandName}" appears in the title or main heading.`,
        }
      : {
          id: "brand-name",
          label: "Brand name in title or heading",
          status: "warn",
          impact: "medium",
          detail: `"${brandName}" does not appear in the title or the H1.`,
          fix: "Put the exact brand name in the title and main heading, so models can tie the page to the brand.",
        },
  );

  const canonical = tagsOf(html, "link").some(
    (a) => (a.rel ?? "").toLowerCase() === "canonical" && a.href,
  );
  add(
    canonical
      ? {
          id: "canonical",
          label: "Canonical URL",
          status: "pass",
          impact: "low",
          detail: "A canonical link is set.",
        }
      : {
          id: "canonical",
          label: "Canonical URL",
          status: "warn",
          impact: "low",
          detail: "No canonical link found.",
          fix: "Add a canonical link tag, so duplicate URLs point to one preferred page.",
        },
  );

  // Structured data
  const types = jsonLdTypes(html);
  const hasOrg = types.some((t) =>
    /^(Organization|Corporation|LocalBusiness|Brand|SoftwareApplication|Product)$/i.test(
      t,
    ),
  );
  add(
    hasOrg
      ? {
          id: "schema",
          label: "Structured data (schema)",
          status: "pass",
          impact: "high",
          detail: `Found: ${types.slice(0, 6).join(", ")}.`,
        }
      : {
          id: "schema",
          label: "Structured data (schema)",
          status: types.length ? "warn" : "fail",
          impact: "high",
          detail: types.length
            ? `Structured data found (${types.slice(0, 6).join(", ")}) but no Organization or product type.`
            : "No JSON-LD structured data found.",
          fix: "Add JSON-LD for Organization (name, url, logo, sameAs profile links) and for your main product or service.",
        },
  );

  // Content AI can read
  const text = visibleText(html);
  add(
    text.length >= 800
      ? {
          id: "readable",
          label: "Content readable without JavaScript",
          status: "pass",
          impact: "high",
          detail: `About ${text.length.toLocaleString("en-US")} characters of text in the page source.`,
        }
      : {
          id: "readable",
          label: "Content readable without JavaScript",
          status: text.length < 300 ? "fail" : "warn",
          impact: "high",
          detail: `Only about ${text.length} characters of text are in the page source. Many AI crawlers do not run JavaScript.`,
          fix: "Render the main content on the server (or pre-render it), so the text is in the HTML the crawler receives.",
        },
  );

  const headings = [...html.matchAll(/<h[23]\b/gi)].length;
  add(
    headings >= 3
      ? {
          id: "structure",
          label: "Clear page structure",
          status: "pass",
          impact: "low",
          detail: `${headings} subheadings (H2 or H3).`,
        }
      : {
          id: "structure",
          label: "Clear page structure",
          status: "warn",
          impact: "low",
          detail: `Only ${headings} subheadings found.`,
          fix: "Break the page into sections with descriptive H2 and H3 headings that match questions people ask.",
        },
  );

  const links = [
    ...html.matchAll(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi),
  ].map((m) => m[1].toLowerCase());
  const found = PAGE_TYPES.filter(([, re]) =>
    links.some((l) => re.test(l)),
  ).map(([n]) => n);
  const missing = PAGE_TYPES.map(([n]) => n).filter((n) => !found.includes(n));
  add(
    found.length >= 3
      ? {
          id: "answer-pages",
          label: "Pages that answer buyer questions",
          status: "pass",
          impact: "medium",
          detail: `Linked from the homepage: ${found.join(", ")}.${missing.length ? ` Not linked: ${missing.join(", ")}.` : ""}`,
        }
      : {
          id: "answer-pages",
          label: "Pages that answer buyer questions",
          status: found.length === 0 ? "fail" : "warn",
          impact: "medium",
          detail: found.length
            ? `Linked from the homepage: ${found.join(", ")}. Missing: ${missing.join(", ")}.`
            : "No links to pricing, FAQ, comparison, guide, or docs pages found on the homepage.",
          fix: "Publish pages that answer the questions in your prompts: comparisons and alternatives, FAQs, pricing, and how-to guides, and link to them from the homepage.",
        },
  );

  add(
    home.ms <= 1500
      ? {
          id: "speed",
          label: "Response time",
          status: "pass",
          impact: "low",
          detail: `The homepage answered in ${home.ms} ms.`,
        }
      : {
          id: "speed",
          label: "Response time",
          status: home.ms <= 4000 ? "warn" : "fail",
          impact: "low",
          detail: `The homepage took ${home.ms} ms to answer.`,
          fix: "Speed up the server response with caching or a CDN. Slow pages are fetched less reliably.",
        },
  );

  return { score: scoreChecks(checks), checks, finalUrl: home.url };
}
