import { prisma } from "@/src/lib/prisma";
import { parseMentions } from "./parser/mentions";

/** Recompute mentions for every stored answer of a project. Makes no model calls. */
export async function reparseProject(projectId: string) {
  const [brands, runs] = await Promise.all([
    prisma.brand.findMany({ where: { projectId } }),
    prisma.run.findMany({
      where: { projectId, status: "COMPLETED", rawText: { not: null } },
      select: { id: true, rawText: true },
    }),
  ]);

  for (const run of runs) {
    const mentions = parseMentions(run.rawText!, brands);
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { runId: run.id } }),
      prisma.mention.createMany({
        data: mentions.map((m) => ({ runId: run.id, ...m })),
      }),
    ]);
  }
  return runs.length;
}
