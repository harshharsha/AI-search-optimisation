type Group = {
  agents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
};
export type Robots = { groups: Group[]; sitemaps: string[] };

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (!line || idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      current?.rules.push({ type: key, path: value });
      lastWasAgent = false;
    } else if (key === "sitemap") {
      if (value) sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

/** True when the bot is barred from the whole site. A group that names the bot wins over "*". */
export function isBlocked(robots: Robots, bot: string): boolean {
  const name = bot.toLowerCase();
  const group =
    robots.groups.find((g) => g.agents.includes(name)) ??
    robots.groups.find((g) => g.agents.includes("*"));
  if (!group) return false;
  const root = (p: string) => p === "/" || p === "/*";
  const disallowsRoot = group.rules.some(
    (r) => r.type === "disallow" && root(r.path),
  );
  const allowsRoot = group.rules.some(
    (r) => r.type === "allow" && root(r.path),
  );
  return disallowsRoot && !allowsRoot;
}
