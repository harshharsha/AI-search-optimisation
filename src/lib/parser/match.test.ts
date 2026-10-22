import { describe, expect, it } from "vitest";
import { findMatches } from "./match";
import { parseMentions } from "./mentions";
import { segmentAnswer } from "./highlight";

const linear = { id: "l", name: "Linear", aliases: [] as string[] };

describe("findMatches", () => {
  it("matches the brand name only with the exact casing", () => {
    const m = findMatches("Linear is fast. A linear workflow is not a brand.", [
      linear,
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].index).toBe(0);
  });

  it("matches aliases without regard to case", () => {
    const brand = { ...linear, aliases: ["linear.app"] };
    expect(findMatches("See LINEAR.APP for details", [brand])).toHaveLength(1);
  });

  it("respects word boundaries", () => {
    expect(findMatches("Linearly independent", [linear])).toHaveLength(0);
    expect(findMatches("(Linear)", [linear])).toHaveLength(1);
  });

  it("treats regex characters in names literally", () => {
    const monday = { id: "m", name: "Monday.com", aliases: [] };
    expect(findMatches("Monday.com is a tool", [monday])).toHaveLength(1);
    expect(findMatches("Mondayxcom is not", [monday])).toHaveLength(0);
  });

  it("keeps the longest match when a name and alias overlap", () => {
    const jira = { id: "j", name: "Jira", aliases: ["Atlassian Jira"] };
    const m = findMatches("Atlassian Jira is popular", [jira]);
    expect(m).toHaveLength(1);
    expect(m[0].length).toBe("Atlassian Jira".length);
  });

  it("matches names with accents and digits", () => {
    const b = { id: "b", name: "Zoé2", aliases: [] };
    expect(findMatches("Try Zoé2 today", [b])).toHaveLength(1);
  });
});

describe("parseMentions", () => {
  it("orders brands by first appearance and counts repeats", () => {
    const brands = [
      { id: "t", name: "Trello", aliases: [] },
      { id: "a", name: "Asana", aliases: [] },
    ];
    const out = parseMentions(
      "Trello first, then Asana, then Trello again.",
      brands,
    );
    expect(out.map((m) => [m.brandId, m.position, m.count])).toEqual([
      ["t", 1, 2],
      ["a", 2, 1],
    ]);
    expect(out[0].snippet).toContain("Trello");
  });

  it("returns nothing when no brand is named", () => {
    expect(parseMentions("Nothing here", [linear])).toEqual([]);
  });
});

describe("segmentAnswer", () => {
  it("rebuilds the original text from its segments", () => {
    const text = "Use Linear or Jira. Linear wins.";
    const brands = [linear, { id: "j", name: "Jira", aliases: [] }];
    const segs = segmentAnswer(text, brands);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.brandId).map((s) => s.text)).toEqual([
      "Linear",
      "Jira",
      "Linear",
    ]);
  });

  it("returns the whole text when nothing matches", () => {
    expect(segmentAnswer("plain", [linear])).toEqual([{ text: "plain" }]);
  });
});
