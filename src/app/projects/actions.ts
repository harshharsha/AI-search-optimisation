"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { randomBytes } from "node:crypto";
import { reparseProject } from "@/src/lib/reparse";
import { createRunsForProject } from "@/src/lib/runs";
import { runSiteAudit } from "@/src/lib/audit/checks";
import { getDashboard } from "@/src/lib/dashboard";
import { findMatches } from "@/src/lib/parser/match";
import { getProvider } from "@/src/lib/providers";
import { buildBriefPrompt } from "@/src/lib/brief";
import { discoverMarket } from "@/src/lib/discovery";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
const repeatsOf = (v: FormDataEntryValue | null) =>
  Math.min(10, Math.max(1, parseInt(String(v ?? "1"), 10) || 1));
const cleanDomain = (d: string) =>
  d
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

/** "Jira, atlassian.com" -> { name: "Jira", domain: "atlassian.com" } */
function parseBrandLine(line: string) {
  const [name, ...rest] = line.split(",");
  const domain = cleanDomain(rest.join(",").trim());
  return { name: name.trim(), domain: domain || null };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/plan`);
}

export async function createProject(formData: FormData) {
  const ownName = text(formData.get("ownName"));
  const name = text(formData.get("name")) || ownName;
  if (!name || !ownName) redirect("/projects/new?error=missing");

  const models = list(formData.get("models"));
  if (models.length === 0) redirect("/projects/new?error=models");

  const own = {
    name: ownName,
    domain: cleanDomain(text(formData.get("ownDomain"))) || null,
    isOwn: true,
  };
  const seen = new Set([ownName.toLowerCase()]);
  const competitors = lines(formData.get("competitors"))
    .map(parseBrandLine)
    .filter((b) => {
      const key = b.name.toLowerCase();
      if (!b.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((b) => ({ ...b, isOwn: false }));

  const project = await prisma.project.create({
    data: {
      name,
      models,
      repeats: repeatsOf(formData.get("repeats")),
      brands: { create: [own, ...competitors] },
      prompts: {
        create: lines(formData.get("prompts")).map((t) => ({ text: t })),
      },
    },
  });

  redirect(`/projects/${project.id}`);
}

export async function saveProject(projectId: string, formData: FormData) {
  const name = text(formData.get("name"));
  const models = list(formData.get("models"));
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name ? { name } : {}),
      ...(models.length ? { models } : {}),
      repeats: repeatsOf(formData.get("repeats")),
    },
  });
  refresh(projectId);
}

export async function addBrand(projectId: string, formData: FormData) {
  const name = text(formData.get("name"));
  if (!name) return;
  await prisma.brand.createMany({
    data: [
      {
        projectId,
        name,
        domain: cleanDomain(text(formData.get("domain"))) || null,
        aliases: list(formData.get("aliases")),
      },
    ],
    skipDuplicates: true,
  });
  await reparseProject(projectId); // a new brand also counts in past answers
  refresh(projectId);
}

export async function deleteBrand(brandId: string) {
  const brand = await prisma.brand
    .delete({ where: { id: brandId } })
    .catch(() => null);
  if (brand) refresh(brand.projectId);
}

export async function makeOwnBrand(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { projectId: true },
  });
  if (!brand) return;
  await prisma.$transaction([
    prisma.brand.updateMany({
      where: { projectId: brand.projectId },
      data: { isOwn: false },
    }),
    prisma.brand.update({ where: { id: brandId }, data: { isOwn: true } }),
  ]);
  refresh(brand.projectId);
}

export async function addPrompts(projectId: string, formData: FormData) {
  const prompts = lines(formData.get("prompts"));
  if (prompts.length === 0) return;
  await prisma.prompt.createMany({
    data: prompts.map((t) => ({ projectId, text: t })),
  });
  refresh(projectId);
}

export async function deletePrompt(promptId: string) {
  const prompt = await prisma.prompt
    .delete({ where: { id: promptId } })
    .catch(() => null);
  if (prompt) refresh(prompt.projectId);
}

export async function togglePrompt(promptId: string) {
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) return;
  await prisma.prompt.update({
    where: { id: promptId },
    data: { active: !prompt.active },
  });
  refresh(prompt.projectId);
}

export async function runNow(projectId: string) {
  const count = await createRunsForProject(projectId);
  refresh(projectId);
  redirect(`/projects/${projectId}?queued=${count}`);
}

export async function deleteProject(projectId: string) {
  await prisma.project.delete({ where: { id: projectId } }).catch(() => null);
  redirect("/");
}

/** Create (or replace) the public read-only report link */
export async function enableSharing(projectId: string) {
  await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: randomBytes(16).toString("hex") },
  });
  refresh(projectId);
}

export async function disableSharing(projectId: string) {
  await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: null },
  });
  refresh(projectId);
}

/** Put failed runs back in line; the worker queues them again */
export async function retryFailed(projectId: string) {
  await prisma.run.updateMany({
    where: { projectId, status: "FAILED" },
    data: { status: "PENDING", queuedAt: null, error: null },
  });
  refresh(projectId);
}

export async function updateBrand(brandId: string, formData: FormData) {
  const name = text(formData.get("name"));
  if (!name) return;
  const brand = await prisma.brand
    .update({
      where: { id: brandId },
      data: {
        name,
        domain: cleanDomain(text(formData.get("domain"))) || null,
        aliases: list(formData.get("aliases")),
      },
    })
    .catch(() => null);
  if (!brand) return;
  await reparseProject(brand.projectId);
  refresh(brand.projectId);
}

/** Check the brand's website for AI readiness and save the result */
export async function runAudit(projectId: string) {
  const own = await prisma.brand.findFirst({
    where: { projectId, isOwn: true },
  });
  if (!own?.domain) redirect(`/projects/${projectId}/audit?error=nodomain`);

  const result = await runSiteAudit(`https://${own.domain}`, own.name);
  await prisma.audit.create({
    data: {
      projectId,
      url: result.finalUrl,
      score: result.score,
      checks: JSON.parse(JSON.stringify(result.checks)),
    },
  });
  refresh(projectId);
  revalidatePath(`/projects/${projectId}/audit`);
  redirect(`/projects/${projectId}/audit`);
}

// ---------- Action plan ----------

const TASK_KINDS = ["WEBSITE", "CONTENT", "OUTREACH", "OTHER"] as const;
type TaskKindValue = (typeof TASK_KINDS)[number];

export async function addTask(projectId: string, formData: FormData) {
  const title = text(formData.get("title"));
  if (!title) return;
  const raw = text(formData.get("kind"));
  const kind: TaskKindValue = (TASK_KINDS as readonly string[]).includes(raw)
    ? (raw as TaskKindValue)
    : "OTHER";
  await prisma.task.create({
    data: {
      projectId,
      title,
      kind,
      detail: text(formData.get("detail")) || null,
    },
  });
  refresh(projectId);
}

export async function setTaskStatus(
  taskId: string,
  status: "TODO" | "IN_PROGRESS" | "DONE",
) {
  const task = await prisma.task
    .update({
      where: { id: taskId },
      data: { status, doneAt: status === "DONE" ? new Date() : null },
    })
    .catch(() => null);
  if (task) refresh(task.projectId);
}

export async function deleteTask(taskId: string) {
  const task = await prisma.task
    .delete({ where: { id: taskId } })
    .catch(() => null);
  if (task) refresh(task.projectId);
}

/** Draft tasks from the latest audit and the prompts where AI skips the brand. Never creates duplicates. */
export async function suggestTasks(projectId: string) {
  const data = await getDashboard(projectId);
  if (!data) redirect("/");
  const { own, opportunities, audit, project } = data;
  const brandName = own?.brand.name ?? "the brand";

  const draft: {
    source: string;
    kind: TaskKindValue;
    title: string;
    detail: string;
  }[] = [];

  for (const c of audit?.checks ?? []) {
    if (c.status === "pass") continue;
    if (c.status === "warn" && c.impact === "low") continue;
    draft.push({
      source: `audit:${c.id}`,
      kind: "WEBSITE",
      title: `Fix: ${c.label}`,
      detail: [c.detail, c.fix].filter(Boolean).join(" "),
    });
  }

  for (const o of opportunities) {
    const named = o.named.map((n) => n.brand.name).join(", ");
    draft.push({
      source: `content:${o.prompt.id}`,
      kind: "CONTENT",
      title: `Publish a page that answers: ${o.prompt.text}`,
      detail: `${brandName} is named in ${o.hits} of ${o.total} answers.${named ? ` AI names ${named} instead.` : ""} Answer the question directly and compare the options honestly.`,
    });
  }

  // Sites cited in the weak answers, other than the tracked brands' own sites
  const brandDomains = project.brands.flatMap((b) =>
    b.domain ? [b.domain.replace(/^www\./, "").toLowerCase()] : [],
  );
  const byDomain = new Map<string, Set<string>>();
  for (const o of opportunities) {
    for (const d of o.domains) {
      if (
        brandDomains.some(
          (bd) => d.domain === bd || d.domain.endsWith(`.${bd}`),
        )
      )
        continue;
      let prompts = byDomain.get(d.domain);
      if (!prompts) {
        prompts = new Set();
        byDomain.set(d.domain, prompts);
      }
      prompts.add(o.prompt.text);
    }
  }
  const targets = [...byDomain.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 6);
  for (const [domain, prompts] of targets) {
    draft.push({
      source: `outreach:${domain}`,
      kind: "OUTREACH",
      title: `Get ${brandName} featured on ${domain}`,
      detail: `Cited in answers where ${brandName} is rarely named: ${[
        ...prompts,
      ]
        .slice(0, 3)
        .map((p) => `"${p}"`)
        .join("; ")}.`,
    });
  }

  const res = await prisma.task.createMany({
    data: draft.map((d) => ({ projectId, ...d })),
    skipDuplicates: true,
  });
  refresh(projectId);
  redirect(`/projects/${projectId}/plan?added=${res.count}`);
}

/** Draft a content brief for a task, grounded in recent AI answers to the related prompt */
export async function generateBrief(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { brands: true } } },
  });
  if (!task) redirect("/");

  const { project } = task;
  const back = `/projects/${project.id}/plan/${task.id}`;
  const own = project.brands.find((b) => b.isOwn) ?? null;
  const brandName = own?.name ?? "the brand";

  const promptId = task.source?.startsWith("content:")
    ? task.source.slice("content:".length)
    : null;
  const prompt = promptId
    ? await prisma.prompt.findUnique({ where: { id: promptId } })
    : null;
  const topic =
    prompt?.text ?? task.title.replace(/^Publish a page that answers:\s*/i, "");

  let hits = 0;
  let total = 0;
  let excerpt = "";
  const named = new Map<string, number>();
  const sources = new Map<string, number>();

  if (prompt) {
    const runs = await prisma.run.findMany({
      where: { promptId: prompt.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 9,
      include: { mentions: true, citations: { select: { domain: true } } },
    });
    total = runs.length;
    const inPrompt = new Set(
      findMatches(prompt.text, project.brands).map((m) => m.brandId),
    );
    for (const r of runs) {
      if (own && r.mentions.some((m) => m.brandId === own.id)) hits++;
      for (const m of r.mentions) {
        if (m.brandId !== own?.id && !inPrompt.has(m.brandId))
          named.set(m.brandId, (named.get(m.brandId) ?? 0) + 1);
      }
      for (const d of new Set(r.citations.map((c) => c.domain)))
        sources.set(d, (sources.get(d) ?? 0) + 1);
    }
    excerpt = (runs.find((r) => r.rawText)?.rawText ?? "").slice(0, 1800);
  }

  const model = (process.env.BRIEF_MODEL || project.models[0] || "").replace(
    /:online$/,
    "",
  );
  if (!model) redirect(`${back}?error=nomodel`);

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);

  const result = await getProvider(model)
    .run(
      model,
      buildBriefPrompt({
        brandName,
        brandDomain: own?.domain ?? null,
        topic,
        hits,
        total,
        named: top(named, 4)
          .map((id) => project.brands.find((b) => b.id === id)?.name ?? "")
          .filter(Boolean),
        sources: top(sources, 6),
        excerpt,
      }),
    )
    .catch((e: unknown) =>
      e instanceof Error ? e : new Error("The model did not answer"),
    );

  if (result instanceof Error) {
    redirect(
      `${back}?error=${encodeURIComponent(result.message.slice(0, 200))}`,
    );
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { brief: result.text, briefModel: model, briefAt: new Date() },
  });
  refresh(project.id);
  revalidatePath(back);
  redirect(back);
}

/** Find the five closest competitors and suggested prompts for an existing project. Keeps what is already there. */
export async function discoverForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { brands: true, prompts: { select: { text: true } } },
  });
  if (!project) redirect("/");

  const back = `/projects/${projectId}/settings`;
  const own = project.brands.find((b) => b.isOwn);
  if (!own)
    redirect(
      `${back}?error=${encodeURIComponent("Mark one brand as yours first.")}`,
    );

  const res = await discoverMarket({
    brandName: own.name,
    website: own.domain ?? "",
    model: project.models[0] ?? "",
  });
  if (!res.ok) redirect(`${back}?error=${encodeURIComponent(res.error)}`);

  const knownNames = new Set(project.brands.map((b) => b.name.toLowerCase()));
  const knownDomains = new Set(
    project.brands.flatMap((b) => (b.domain ? [b.domain.toLowerCase()] : [])),
  );
  const fresh = res.competitors.filter(
    (c) =>
      !knownNames.has(c.name.toLowerCase()) &&
      !(c.domain && knownDomains.has(c.domain)),
  );
  await prisma.brand.createMany({
    data: fresh.map((c) => ({ projectId, name: c.name, domain: c.domain })),
    skipDuplicates: true,
  });

  const havePrompts = new Set(project.prompts.map((p) => p.text.toLowerCase()));
  const newPrompts = res.prompts.filter(
    (p) => !havePrompts.has(p.toLowerCase()),
  );
  await prisma.prompt.createMany({
    data: newPrompts.map((text) => ({ projectId, text })),
  });

  if (fresh.length > 0) await reparseProject(projectId); // new brands also count in past answers
  refresh(projectId);
  redirect(`${back}?found=${fresh.length}&prompts=${newPrompts.length}`);
}
