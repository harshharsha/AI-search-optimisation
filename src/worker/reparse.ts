import "dotenv/config";
import { prisma } from "@/src/lib/prisma";
import { reparseProject } from "../lib/reparse";

/** Recompute mentions for every stored answer: npm run reparse */
async function main() {
  const projects = await prisma.project.findMany({ select: { id: true } });
  let total = 0;
  for (const p of projects) total += await reparseProject(p.id);
  console.log(`Re-parsed ${total} runs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
