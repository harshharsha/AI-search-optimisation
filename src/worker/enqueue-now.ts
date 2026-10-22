import "dotenv/config";
import { PgBoss } from "pg-boss";
import { enqueueAll, RUN_QUEUE } from "./enqueue";

/** Trigger a run immediately instead of waiting for the schedule: npm run enqueue */
async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL!);
  boss.on("error", (e) => console.error("[pg-boss]", e));
  await boss.start();
  await boss.createQueue(RUN_QUEUE);
  const n = await enqueueAll(boss);
  console.log(`Queued ${n} runs`);
  await boss.stop({ graceful: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
