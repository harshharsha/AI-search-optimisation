import { prisma } from "@/src/lib/prisma";
import { getProvider, ProviderError } from "../lib/providers";
import { parseMentions } from "../lib/parser/mentions";
import { parseCitations } from "../lib/parser/citations";

export async function processRun(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { prompt: true, project: { include: { brands: true } } },
  });
  if (!run || run.status === "COMPLETED") return;

  await prisma.run.update({
    where: { id: runId },
    data: { status: "RUNNING", error: null },
  });

  try {
    const result = await getProvider(run.model).run(run.model, run.prompt.text);
    const brands = run.project.brands;
    const mentions = parseMentions(result.text, brands);
    const citations = parseCitations(result.text, result.citations, brands);

    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { runId } }),
      prisma.citation.deleteMany({ where: { runId } }),
      prisma.mention.createMany({
        data: mentions.map((m) => ({ runId, ...m })),
      }),
      prisma.citation.createMany({
        data: citations.map((c) => ({ runId, ...c })),
      }),
      prisma.run.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          rawText: result.text,
          latencyMs: result.latencyMs,
          finishedAt: new Date(),
        },
      }),
    ]);
  } catch (err) {
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      },
    });
    // Payment and key problems will not fix themselves, so do not retry them
    if (
      err instanceof ProviderError &&
      (err.status === 401 || err.status === 402)
    )
      return;
    throw err; // anything else: let pg-boss retry with backoff
  }
}
