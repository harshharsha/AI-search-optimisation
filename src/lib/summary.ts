import { DashboardData } from "./dashboard";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Plain-language headline and next steps for the client report, derived from the numbers */
export function buildSummary(d: DashboardData) {
  const { rows, own, ownRank, completed, opportunities, domains, ownDomain } =
    d;
  const leader = rows[0];

  let headline = "No results yet";
  let lede = "Run the prompts to see how AI models talk about this market.";

  if (completed > 0 && own && ownRank) {
    headline = `${own.brand.name} is named in ${pct(own.rate)} of AI answers`;
    lede =
      ownRank === 1
        ? `${own.brand.name} leads ${rows.length - 1} tracked competitors.`
        : `${own.brand.name} ranks ${ownRank} of ${rows.length} tracked brands. ${leader.brand.name} leads at ${pct(leader.rate)}.`;
  } else if (completed > 0 && leader) {
    headline = `${leader.brand.name} leads at ${pct(leader.rate)} of AI answers`;
    lede = "No brand is marked as the client's own.";
  }

  const actions: string[] = [];
  if (own) {
    if (ownRank && ownRank > 1 && leader) {
      const gap = Math.round((leader.rate - own.rate) * 100);
      actions.push(
        `Close the ${gap} point gap to ${leader.brand.name}, starting with the prompts below where ${own.brand.name} is rarely named.`,
      );
    }
    for (const o of opportunities.slice(0, 2)) {
      if (o.domains.length > 0) {
        actions.push(
          `For "${o.prompt.text}", get ${own.brand.name} featured on ${o.domains
            .slice(0, 3)
            .map((x) => x.domain)
            .join(", ")}, the sources cited in those answers.`,
        );
      } else {
        actions.push(
          `For "${o.prompt.text}", re-run with a web-search model to find which sources to target.`,
        );
      }
    }
    const ownCited = ownDomain
      ? domains.some((x) => x.domain.endsWith(ownDomain))
      : false;
    if (ownDomain && domains.length > 0 && !ownCited) {
      actions.push(
        `${ownDomain} was not among the most cited sources. Publish pages that answer these prompts directly, such as comparisons and how-to guides.`,
      );
    }
  }

  if (d.audit) {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const fails = d.audit.checks
      .filter((c) => c.status === "fail")
      .sort((a, b) => rank[a.impact] - rank[b.impact]);
    if (fails.length > 0) {
      actions.push(
        `Fix ${fails.length} website ${fails.length === 1 ? "issue" : "issues"} that limit AI visibility, starting with: ${fails[0].label.toLowerCase()}.`,
      );
    }
  }

  return { headline, lede, actions };
}
