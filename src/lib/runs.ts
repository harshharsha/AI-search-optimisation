import prisma from "./prisma";

/**
 * Create pending Runs: one per (active prompt x model x repeat).
 * The worker notices them and queues the jobs, so the web app never talks to pg-boss.
 */
export async function createRunsForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { prompts: { where: { active: true }, select: { id: true } } },
  });
  if (!project) return 0;

  const repeats = Math.min(10, Math.max(1, project.repeats));
  const data = project.prompts.flatMap((p) =>
    project.models.flatMap((model) =>
      Array.from({ length: repeats }, () => ({
        projectId,
        promptId: p.id,
        model,
      })),
    ),
  );
  if (data.length === 0) return 0;

  const res = await prisma.run.createMany({ data });
  return res.count;
}
