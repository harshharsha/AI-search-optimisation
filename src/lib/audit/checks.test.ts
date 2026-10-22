import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./safe-fetch", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "./safe-fetch";
import { runSiteAudit, scoreChecks, type Check } from "./checks";

const mocked = vi.mocked(safeFetch);

type Reply = {
  status?: number;
  body?: string;
  ms?: number;
  headers?: Record<string, string>;
};

function serve(routes: Record<string, Reply>, base = "https://example.com") {
  mocked.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    const r = routes[path];
    return {
      url: `${base}${path}`,
      status: r?.status ?? 404,
      headers: new Headers(r?.headers ?? {}),
      body: r?.body ?? "",
      ms: r?.ms ?? 200,
      redirects: [],
    };
  });
}

const paragraph =
  "AcmeCo helps teams plan work and ship faster with a simple, reliable workflow. ".repeat(
    14,
  );

const goodHome = `<!doctype html><html lang="en"><head>
<title>AcmeCo: project planning for teams</title>
<meta name="description" content="AcmeCo is a project planning tool for software teams that want less process.">
<link rel="canonical" href="https://example.com/">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"AcmeCo"}]}</script>
</head><body>
<h1>AcmeCo plans your work</h1>
<h2>Plan</h2><p>${paragraph}</p><h2>Track</h2><h3>Reports</h3>
<a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/blog">Blog</a><a href="/faq">FAQ</a>
</body></html>`;

const goodSite = {
  "/": { status: 200, body: goodHome, ms: 400 },
  "/robots.txt": {
    status: 200,
    body: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n",
  },
  "/sitemap.xml": {
    status: 200,
    body: '<?xml version="1.0"?><urlset></urlset>',
  },
  "/llms.txt": { status: 200, body: "# AcmeCo\n> Project planning" },
};

const byId = (checks: Check[]) =>
  Object.fromEntries(checks.map((c) => [c.id, c]));

beforeEach(() => {
  mocked.mockReset();
});

describe("scoreChecks", () => {
  it("weights by impact and status", () => {
    const checks: Check[] = [
      { id: "a", label: "a", status: "pass", impact: "high", detail: "" },
      { id: "b", label: "b", status: "fail", impact: "high", detail: "" },
      { id: "c", label: "c", status: "warn", impact: "low", detail: "" },
    ];
    // (3 + 0 + 0.5) / (3 + 3 + 1)
    expect(scoreChecks(checks)).toBe(50);
  });

  it("is 0 for an empty list", () => {
    expect(scoreChecks([])).toBe(0);
  });
});

describe("runSiteAudit", () => {
  it("passes every check for a well-built site", async () => {
    serve(goodSite);
    const { score, checks } = await runSiteAudit(
      "https://example.com",
      "AcmeCo",
    );
    const failing = checks
      .filter((c) => c.status !== "pass")
      .map((c) => `${c.id}: ${c.detail}`);
    expect(failing).toEqual([]);
    expect(score).toBe(100);
  });

  it("fails when robots.txt blocks AI search crawlers", async () => {
    serve({
      ...goodSite,
      "/robots.txt": {
        status: 200,
        body: "User-agent: OAI-SearchBot\nDisallow: /\n",
      },
    });
    const { checks } = await runSiteAudit("https://example.com", "AcmeCo");
    const c = byId(checks)["ai-crawlers"];
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("OAI-SearchBot");
  });

  it("treats blocked training crawlers as a policy choice, not a failure", async () => {
    serve({
      ...goodSite,
      "/robots.txt": { status: 200, body: "User-agent: GPTBot\nDisallow: /\n" },
    });
    const { checks } = await runSiteAudit("https://example.com", "AcmeCo");
    const c = byId(checks)["ai-crawlers"];
    expect(c.status).toBe("pass");
    expect(c.detail).toContain("GPTBot");
  });

  it("fails a page with almost no text in the source", async () => {
    serve({
      ...goodSite,
      "/": {
        status: 200,
        body: '<html><head><title>App</title></head><body><div id="root"></div><script>x()</script></body></html>',
      },
    });
    const { checks } = await runSiteAudit("https://example.com", "AcmeCo");
    expect(byId(checks)["readable"].status).toBe("fail");
  });

  it("fails noindex in a meta tag and in a header", async () => {
    serve({
      ...goodSite,
      "/": {
        status: 200,
        body: goodHome.replace(
          "<head>",
          '<head><meta name="robots" content="noindex,follow">',
        ),
      },
    });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "noindex"
      ].status,
    ).toBe("fail");

    serve({
      ...goodSite,
      "/": {
        status: 200,
        body: goodHome,
        headers: { "x-robots-tag": "noindex" },
      },
    });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "noindex"
      ].status,
    ).toBe("fail");
  });

  it("scores 0 with one failing check when the site cannot be fetched", async () => {
    mocked.mockRejectedValue(new Error("Could not find nope.test"));
    const { score, checks } = await runSiteAudit("https://nope.test", "AcmeCo");
    expect(score).toBe(0);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe("fail");
  });

  it("does not count a soft 404 page as llms.txt or robots.txt", async () => {
    const html = "<!doctype html><html><body>Not found</body></html>";
    serve({
      ...goodSite,
      "/llms.txt": { status: 200, body: html },
      "/robots.txt": { status: 200, body: html },
    });
    const { checks } = await runSiteAudit("https://example.com", "AcmeCo");
    expect(byId(checks)["llms"].status).toBe("warn");
    expect(byId(checks)["robots"].status).toBe("warn");
  });

  it("finds a sitemap listed in robots.txt even when /sitemap.xml is missing", async () => {
    serve({ ...goodSite, "/sitemap.xml": { status: 404 } });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "sitemap"
      ].status,
    ).toBe("pass");
  });

  it("flags missing structured data, then accepts a JSON-LD list at the top level", async () => {
    const noSchema = goodHome.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      "",
    );
    serve({ ...goodSite, "/": { status: 200, body: noSchema } });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "schema"
      ].status,
    ).toBe("fail");

    const listed = goodHome.replace(
      /\{"@context"[\s\S]*?\]\}/,
      '[{"@type":"Organization","name":"AcmeCo"}]',
    );
    serve({ ...goodSite, "/": { status: 200, body: listed } });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "schema"
      ].status,
    ).toBe("pass");
  });

  it("collapses a heading whose text repeats", async () => {
    const repeated = goodHome.replace(
      "<h1>AcmeCo plans your work</h1>",
      "<h1><span>AcmeCo plans your work</span> <span>AcmeCo plans your work</span> <span>AcmeCo plans your work</span></h1>",
    );
    serve({ ...goodSite, "/": { status: 200, body: repeated } });
    const h1 = byId(
      (await runSiteAudit("https://example.com", "AcmeCo")).checks,
    )["h1"];
    expect(h1.status).toBe("pass");
    expect(h1.detail).toBe('H1: "AcmeCo plans your work"');
  });

  it("warns when the brand name is not in the title or heading", async () => {
    serve({
      ...goodSite,
      "/": { status: 200, body: goodHome.replace(/AcmeCo/g, "Other") },
    });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "brand-name"
      ].status,
    ).toBe("warn");
  });

  it("grades response time", async () => {
    serve({ ...goodSite, "/": { status: 200, body: goodHome, ms: 2500 } });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "speed"
      ].status,
    ).toBe("warn");
    serve({ ...goodSite, "/": { status: 200, body: goodHome, ms: 6000 } });
    expect(
      byId((await runSiteAudit("https://example.com", "AcmeCo")).checks)[
        "speed"
      ].status,
    ).toBe("fail");
  });

  it("flags plain HTTP", async () => {
    serve(goodSite, "http://example.com");
    expect(
      byId((await runSiteAudit("http://example.com", "AcmeCo")).checks)["https"]
        .status,
    ).toBe("fail");
  });
});
