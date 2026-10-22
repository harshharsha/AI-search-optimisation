import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/safe-fetch", () => ({
  safeFetch: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (d: string) => {
    if (d.includes("ghost")) throw new Error("ENOTFOUND");
    return [{ address: "93.184.216.34" }];
  }),
}));
vi.mock("@/lib/providers", () => ({ getProvider: vi.fn() }));

import { discoverMarket } from "./discovery";
import { getProvider } from "./providers";

const reply = (text: string) =>
  vi.mocked(getProvider).mockReturnValue({
    id: "mock",
    run: async () => ({ text, citations: [], latencyMs: 1 }),
  });

const input = {
  brandName: "Linear",
  website: "https://www.linear.app/",
  model: "m",
};

beforeEach(() => {
  vi.mocked(getProvider).mockReset();
});

describe("discoverMarket", () => {
  it("reads JSON wrapped in a code fence and cleans websites", async () => {
    reply(
      '```json\n{"category":"issue tracking","competitors":[{"name":"Jira","website":"https://www.Atlassian.com/software/jira"},{"name":"Asana","website":"asana.com"}],"prompts":["What is the best issue tracker for startups?"]}\n```',
    );
    const res = await discoverMarket(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.category).toBe("issue tracking");
    expect(res.competitors).toEqual([
      { name: "Jira", domain: "atlassian.com" },
      { name: "Asana", domain: "asana.com" },
    ]);
    expect(res.prompts).toEqual([
      "What is the best issue tracker for startups?",
    ]);
  });

  it("removes the brand itself, duplicates, and caps the list at five", async () => {
    const names = ["Linear", "Jira", "jira", "A1", "B2", "C3", "D4", "E5"];
    reply(
      JSON.stringify({
        category: "x",
        competitors: names.map((n) => ({
          name: n,
          website: `${n.toLowerCase()}.com`,
        })),
        prompts: [],
      }),
    );
    const res = await discoverMarket(input);
    if (!res.ok) throw new Error(res.error);
    expect(res.competitors.map((c) => c.name)).toEqual([
      "Jira",
      "A1",
      "B2",
      "C3",
      "D4",
    ]);
  });

  it("drops the website when it is invalid or does not resolve", async () => {
    reply(
      JSON.stringify({
        category: "x",
        competitors: [
          { name: "Real", website: "real.com" },
          { name: "Guess", website: "ghost-company.com" },
          { name: "Junk", website: "not a domain" },
          { name: "NoSite" },
        ],
        prompts: [],
      }),
    );
    const res = await discoverMarket(input);
    if (!res.ok) throw new Error(res.error);
    expect(res.competitors).toEqual([
      { name: "Real", domain: "real.com" },
      { name: "Guess", domain: null },
      { name: "Junk", domain: null },
      { name: "NoSite", domain: null },
    ]);
  });

  it("filters prompts that are too short, too long, or duplicated", async () => {
    reply(
      JSON.stringify({
        category: "x",
        competitors: [{ name: "Jira", website: "jira.com" }],
        prompts: [
          "too short",
          "What is the best tool for a small team?",
          "what is the best tool for a small team?",
          "x".repeat(300),
          42,
        ],
      }),
    );
    const res = await discoverMarket(input);
    if (!res.ok) throw new Error(res.error);
    expect(res.prompts).toEqual(["What is the best tool for a small team?"]);
  });

  it("explains itself when the model returns no JSON", async () => {
    reply("Sure! Here are some competitors: Jira, Asana.");
    const res = await discoverMarket(input);
    expect(res.ok).toBe(false);
  });

  it("fails when no competitor is usable", async () => {
    reply(JSON.stringify({ category: "x", competitors: [], prompts: [] }));
    expect((await discoverMarket(input)).ok).toBe(false);
  });

  it("returns the provider error message", async () => {
    vi.mocked(getProvider).mockReturnValue({
      id: "mock",
      run: async () => {
        throw new Error("Insufficient credits");
      },
    });
    const res = await discoverMarket(input);
    expect(res).toEqual({ ok: false, error: "Insufficient credits" });
  });

  it("asks for a brand name and a model first", async () => {
    expect((await discoverMarket({ ...input, brandName: " " })).ok).toBe(false);
    expect((await discoverMarket({ ...input, model: "" })).ok).toBe(false);
  });
});
