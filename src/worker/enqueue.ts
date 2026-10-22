import type { PgBoss } from "pg-boss";
import prisma from "../lib/prisma";
import { createRunsForProject } from "../lib/runs";

export const RUN_QUEUE = "run-prompt";
export const SCHEDULE_QUEUE = "enqueue-all";

/** Send a job for every run that has not been queued yet (created by the schedule, CLI, or the web app) */
export async function dispatchPending(boss: PgBoss) {
  const runs = await prisma.run.findMany({
    where: { status: "PENDING", queuedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  for (const r of runs) {
    await boss.send(
      RUN_QUEUE,
      { runId: r.id },
      { retryLimit: 3, retryDelay: 30, retryBackoff: true },
    );
    await prisma.run.update({
      where: { id: r.id },
      data: { queuedAt: new Date() },
    });
  }
  return runs.length;
}

export async function enqueueProject(boss: PgBoss, projectId: string) {
  const created = await createRunsForProject(projectId);
  await dispatchPending(boss);
  return created;
}

export async function enqueueAll(boss: PgBoss) {
  const projects = await prisma.project.findMany({ select: { id: true } });
  let total = 0;
  for (const p of projects) total += await createRunsForProject(p.id);
  await dispatchPending(boss);
  return total;
}
