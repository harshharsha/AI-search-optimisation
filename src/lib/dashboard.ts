import { prisma } from "@/src/lib/prisma";
import { findMatches } from "./parser/match";
import { Check } from "./audit/checks";

const DAYS = 14;
const DAY_MS = 86_400_000;

export const isWeb = (model: string) => model.endsWith(":online");

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const normalizeDomain = (d: string) =>
  d
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

function modelWhere(filter: string) {
  if (filter === "web") return { model: { endsWith: ":online" } };
  if (filter === "memory") return { NOT: { model: { endsWith: ":online" } } };
  if (filter === "all") return {};
  return { model: filter };
}

type RecentRun = {
  promptId: string;
  createdAt: Date;
  mentions: { brandId: string }[];
};

function trendFor(
  runs: RecentRun[],
  brandId: string,
  skip: (promptId: string) => boolean,
): (number | null)[] {
  const buckets = new Map<string, { n: number; hit: number }>();
  for (let i = DAYS - 1; i >= 0; i--) {
    buckets.set(dayKey(new Date(Date.now() - i * DAY_MS)), { n: 0, hit: 0 });
  }
  for (const r of runs) {
    if (skip(r.promptId)) continue;
    const b = buckets.get(dayKey(r.createdAt));
    if (!b) continue;
    b.n++;
    if (r.mentions.some((m) => m.brandId === brandId)) b.hit++;
  }
  return [...buckets.values()].map((b) => (b.n ? b.hit / b.n : null));
}

/** filter: "all" | "web" | "memory" | a model id from the project */
export async function getDashboard(
  projectId: string,
  requestedFilter?: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brands: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) return null;

  const filter =
    requestedFilter === "web" ||
    requestedFilter === "memory" ||
    (requestedFilter && project.models.includes(requestedFilter))
      ? requestedFilter
      : "all";

  const activeModels = project.models.filter((m) =>
    filter === "all"
      ? true
      : filter === "web"
        ? isWeb(m)
        : filter === "memory"
          ? !isWeb(m)
          : m === filter,
  );

  const since = new Date(Date.now() - DAYS * DAY_MS);
  const completedWhere = {
    projectId,
    status: "COMPLETED" as const,
    ...modelWhere(filter),
  };

  const [
    completed,
    statusCounts,
    lastRun,
    rateRuns,
    domainStats,
    recentRuns,
    prompts,
  ] = await Promise.all([
    prisma.run.count({ where: completedWhere }),
    prisma.run.groupBy({
      by: ["status"],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.run.findFirst({
      where: { projectId, status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    prisma.run.findMany({
      where: completedWhere,
      select: {
        promptId: true,
        mentions: { select: { brandId: true, position: true } },
      },
    }),
    prisma.citation.groupBy({
      by: ["domain"],
      where: { run: completedWhere },
      _count: { _all: true },
      orderBy: { _count: { domain: "desc" } },
      take: 8,
    }),
    prisma.run.findMany({
      where: { ...completedWhere, createdAt: { gte: since } },
      select: {
        promptId: true,
        createdAt: true,
        mentions: { select: { brandId: true } },
      },
    }),
    prisma.prompt.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        runs: {
          where: { status: "COMPLETED", ...modelWhere(filter) },
          orderBy: { createdAt: "desc" },
          take:
            Math.max(project.models.length, 1) * Math.max(project.repeats, 3),
          include: { mentions: true, citations: { select: { domain: true } } },
        },
      },
    }),
  ]);

  const latestAudit = await prisma.audit.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      detail: true,
      kind: true,
      status: true,
      doneAt: true,
      createdAt: true,
    },
  });

  const lastFailed = await prisma.run.findFirst({
    where: { projectId, status: "FAILED" },
    orderBy: { createdAt: "desc" },
    select: { error: true },
  });

  const firstRun = await prisma.run.findFirst({
    where: completedWhere,
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  // A prompt that names a brand ("Compare Asana, Trello and Linear") guarantees that brand a
  // mention, so such prompts are left out of that brand's score.
  const namedInPrompt = new Map<string, Set<string>>(
    prompts.map(
      (p) =>
        [
          p.id,
          new Set(findMatches(p.text, project.brands).map((m) => m.brandId)),
        ] as [string, Set<string>],
    ),
  );
  const brandedPrompts = [...namedInPrompt.values()].filter(
    (s) => s.size > 0,
  ).length;

  const rows = project.brands
    .map((brand) => {
      const skip = (promptId: string) =>
        namedInPrompt.get(promptId)?.has(brand.id) ?? false;
      const eligible = rateRuns.filter((r) => !skip(r.promptId));
      const hits = eligible.flatMap((r) =>
        r.mentions.filter((m) => m.brandId === brand.id),
      );
      return {
        brand,
        mentioned: hits.length,
        rate: eligible.length ? hits.length / eligible.length : 0,
        avgPosition: hits.length
          ? hits.reduce((n, m) => n + m.position, 0) / hits.length
          : null,
        trend: trendFor(recentRuns, brand.id, skip),
      };
    })
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        (a.avgPosition ?? 99) - (b.avgPosition ?? 99) ||
        a.brand.name.localeCompare(b.brand.name),
    );

  const domains = domainStats.map((d) => {
    const brand = project.brands.find((b) => {
      if (!b.domain) return false;
      const bd = normalizeDomain(b.domain);
      return d.domain === bd || d.domain.endsWith(`.${bd}`);
    });
    return { domain: d.domain, count: d._count._all, brand: brand ?? null };
  });

  const count = (...s: string[]) =>
    statusCounts
      .filter((c) => s.includes(c.status))
      .reduce((n, c) => n + c._count._all, 0);

  const own = rows.find((r) => r.brand.isOwn) ?? null;
  const brandById = new Map(project.brands.map((b) => [b.id, b]));

  // Prompts where recent answers rarely name the user's brand
  const opportunities = own
    ? prompts
        .filter((p) => p.active && p.runs.length > 0)
        .map((p) => {
          const total = p.runs.length;
          const promptBrands = namedInPrompt.get(p.id) ?? new Set<string>();
          const hits = p.runs.filter((r) =>
            r.mentions.some((m) => m.brandId === own.brand.id),
          ).length;

          const named = new Map<string, number>();
          const sources = new Map<string, number>();
          for (const r of p.runs) {
            for (const m of r.mentions) {
              if (m.brandId !== own.brand.id && !promptBrands.has(m.brandId)) {
                named.set(m.brandId, (named.get(m.brandId) ?? 0) + 1);
              }
            }
            for (const d of new Set(r.citations.map((c) => c.domain))) {
              sources.set(d, (sources.get(d) ?? 0) + 1);
            }
          }

          return {
            prompt: { id: p.id, text: p.text },
            total,
            hits,
            named: [...named.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .flatMap(([id, n]) => {
                const brand = brandById.get(id);
                return brand ? [{ brand, count: n }] : [];
              }),
            domains: [...sources.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([domain, n]) => ({ domain, count: n })),
          };
        })
        .filter((o) => o.hits / o.total < 0.5)
        .sort(
          (a, b) => a.hits / a.total - b.hits / b.total || b.total - a.total,
        )
        .slice(0, 6)
    : [];

  return {
    project,
    filter,
    activeModels,
    completed,
    queued: count("PENDING", "RUNNING"),
    failed: count("FAILED"),
    lastRunAt: lastRun?.finishedAt ?? null,
    firstRunAt: firstRun?.createdAt ?? null,
    lastError: lastFailed?.error ?? null,
    tasks,
    audit: latestAudit
      ? {
          score: latestAudit.score,
          url: latestAudit.url,
          createdAt: latestAudit.createdAt,
          checks: latestAudit.checks as unknown as Check[],
        }
      : null,
    rows,
    own,
    ownRank: own ? rows.indexOf(own) + 1 : null,
    ownDomain: own?.brand.domain ? normalizeDomain(own.brand.domain) : null,
    domains,
    opportunities,
    brandedPrompts,
    prompts,
    days: DAYS,
  };
}

export type DashboardData = NonNullable<
  Awaited<ReturnType<typeof getDashboard>>
>;
