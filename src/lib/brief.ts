export type BriefInput = {
  brandName: string;
  brandDomain: string | null;
  topic: string;
  hits: number;
  total: number;
  named: string[];
  sources: string[];
  excerpt: string;
};

/** The instruction sent to the model to draft a content brief grounded in the current AI answers */
export function buildBriefPrompt(i: BriefInput) {
  const lines = [
    "You are an SEO and AI search specialist. Write a content brief for one web page that answers a question well, so it is useful to readers and likely to be cited by AI answer engines.",
    "",
    `Brand: ${i.brandName}${i.brandDomain ? ` (${i.brandDomain})` : ""}`,
    `Question people ask AI assistants: "${i.topic}"`,
  ];
  if (i.total > 0) {
    lines.push(
      `Current situation: ${i.brandName} is named in ${i.hits} of ${i.total} recent AI answers to this question.`,
    );
  }
  if (i.named.length)
    lines.push(`Other brands named instead: ${i.named.join(", ")}.`);
  if (i.sources.length)
    lines.push(`Websites those answers cite: ${i.sources.join(", ")}.`);
  if (i.excerpt) {
    lines.push(
      "",
      "Excerpt of a recent AI answer, for context on what it covers:",
      '"""',
      i.excerpt,
      '"""',
    );
  }

  lines.push(
    "",
    "Write the brief in Markdown with exactly these sections, in this order:",
    "## Goal",
    "One or two sentences on what the page should achieve.",
    "## Audience and intent",
    "Who asks this question and what they need to decide.",
    "## Page title and H1",
    "Two options for the title and H1.",
    "## Outline",
    "The H2 headings of the page, each with two or three bullets on what to cover.",
    "## Questions to answer",
    "Six to eight specific questions a reader would ask, to use as an FAQ.",
    "## Comparison to include",
    "A Markdown table of criteria to compare the options on. Describe the criteria and what to check. Do not fill in facts you are unsure of.",
    "## Evidence and sources",
    "The kinds of proof to include (data, customer examples, documentation) and the types of third-party sites worth earning a mention on. Do not invent URLs.",
    "## Structured data",
    "Which schema.org types fit this page.",
    "## Internal links and next steps",
    "Pages on the site to link to and what to do after publishing.",
    "",
    "Rules:",
    "- Do not invent statistics, prices, features, customer names, or quotes. Where a fact is needed, write [verify] and say what to check.",
    "- Be fair to the other options. Pages that compare honestly are cited more often than sales copy.",
    "- Be concrete and specific to this question and brand.",
    "- Keep the whole brief under 800 words.",
  );
  return lines.join("\n");
}
