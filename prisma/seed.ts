import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Free model ids change often; check https://openrouter.ai/models?q=free
const models = (
  process.env.DEFAULT_MODELS ?? "nvidia/nemotron-3-ultra-550b-a55b:free:online"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

async function main() {
  const existing = await prisma.project.findFirst({
    where: { name: "Demo: project management tools" },
  });
  if (existing) {
    await prisma.project.update({
      where: { id: existing.id },
      data: { models },
    });
    await prisma.run.deleteMany({
      where: { projectId: existing.id, status: "FAILED" },
    });
    console.log("Updated demo project models");
    return;
  }

  await prisma.project.create({
    data: {
      name: "Demo: project management tools",
      models,
      brands: {
        create: [
          { name: "Linear", domain: "linear.app", isOwn: true },
          { name: "Asana", domain: "asana.com" },
          { name: "Trello", domain: "trello.com" },
          {
            name: "Jira",
            aliases: ["Atlassian Jira"],
            domain: "atlassian.com",
          },
          { name: "Notion", domain: "notion.so" },
        ],
      },
      prompts: {
        create: [
          { text: "What is the best project management tool for a startup?" },
          { text: "What are the best alternatives to Jira?" },
          { text: "Which issue tracker do software teams prefer in 2026?" },
          { text: "Recommend a simple task management app for a small team." },
          { text: "Compare Asana, Trello and Linear." },
        ],
      },
    },
  });
  console.log("Seeded demo project");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
