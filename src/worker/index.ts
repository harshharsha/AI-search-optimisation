import "dotenv/config";
import { PgBoss } from "pg-boss";
import {
  dispatchPending,
  enqueueAll,
  RUN_QUEUE,
  SCHEDULE_QUEUE,
} from "./enqueue";
import { processRun } from "./process-run";

// Free OpenRouter models are limited (~20 requests/min), so pause between calls.
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS ?? 3500);
const SCHEDULE = process.env.RUN_SCHEDULE ?? "0 9 * * *";
// How often to look for runs created from the web app ("Run now")
const DISPATCH_MS = Number(process.env.DISPATCH_MS ?? 5000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL!);
  boss.on("error", (e) => console.error("[pg-boss]", e));
  await boss.start();

  await boss.createQueue(RUN_QUEUE);
  await boss.createQueue(SCHEDULE_QUEUE);

  // Recurring: create runs for every project
  await boss.schedule(SCHEDULE_QUEUE, SCHEDULE);
  await boss.work(SCHEDULE_QUEUE, async () => {
    const n = await enqueueAll(boss);
    console.log(`[schedule] queued ${n} runs`);
  });

  // One run at a time, throttled
  await boss.work(RUN_QUEUE, { batchSize: 1 }, async (jobs: unknown) => {
    const list = (Array.isArray(jobs) ? jobs : [jobs]) as {
      data: { runId: string };
    }[];
    for (const job of list) {
      console.log(`[run] ${job.data.runId}`);
      try {
        await processRun(job.data.runId);
      } finally {
        await sleep(RATE_LIMIT_MS);
      }
    }
  });

  // Pick up runs created from the web app
  let dispatching = false;
  const dispatchLoop = setInterval(async () => {
    if (dispatching) return;
    dispatching = true;
    try {
      const n = await dispatchPending(boss);
      if (n) console.log(`[dispatch] queued ${n} runs`);
    } catch (e) {
      console.error("[dispatch]", e);
    } finally {
      dispatching = false;
    }
  }, DISPATCH_MS);

  console.log(`Worker started. Schedule: "${SCHEDULE}"`);

  const shutdown = async () => {
    clearInterval(dispatchLoop);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
