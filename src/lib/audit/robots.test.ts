import { describe, expect, it } from "vitest";
import { isBlocked, parseRobots } from "./robots";

describe("robots.txt", () => {
  it("blocks a named bot while the wildcard group allows others", () => {
    const r = parseRobots(
      "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n",
    );
    expect(isBlocked(r, "GPTBot")).toBe(true);
    expect(isBlocked(r, "ClaudeBot")).toBe(false);
  });

  it("applies the wildcard group to bots that are not named", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n");
    expect(isBlocked(r, "PerplexityBot")).toBe(true);
  });

  it("lets a bot's own group override the wildcard group", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n",
    );
    expect(isBlocked(r, "Googlebot")).toBe(false);
    expect(isBlocked(r, "Bingbot")).toBe(true);
  });

  it("handles several user-agent lines sharing one group", () => {
    const r = parseRobots(
      "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n",
    );
    expect(isBlocked(r, "GPTBot")).toBe(true);
    expect(isBlocked(r, "CCBot")).toBe(true);
    expect(isBlocked(r, "ClaudeBot")).toBe(false);
  });

  it("does not treat partial disallows as a full block", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /admin\nDisallow: /private/\n",
    );
    expect(isBlocked(r, "Googlebot")).toBe(false);
  });

  it("ignores comments, blank Disallow, and reads sitemaps", () => {
    const r = parseRobots(
      "# hi\nUser-agent: * # everyone\nDisallow:\nSitemap: https://x.com/sitemap.xml\n",
    );
    expect(isBlocked(r, "Googlebot")).toBe(false);
    expect(r.sitemaps).toEqual(["https://x.com/sitemap.xml"]);
  });

  it("allows everything when there are no groups", () => {
    expect(isBlocked(parseRobots(""), "GPTBot")).toBe(false);
  });
});
