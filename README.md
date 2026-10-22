# AISOA

Open-source AI visibility tracker. See how often AI models name your brand, who they name instead, and which websites they cite, so you know where to get featured. Also called GEO (generative engine optimization) or AEO (answer engine optimization).

You give it a brand, its competitors, and the questions your customers ask. It sends those questions to AI models on a schedule, reads the answers, and shows you:

- **Share of voice:** the percentage of answers that name each brand, plus average position and a 14 day trend
- **Sources models cite:** the domains that show up most in answers, with your tracked brands tagged
- **Where AI skips you:** prompts where you are rarely named, who is named instead, and which sources those answers cite
- **Website audit:** checks the brand's site for what AI crawlers and answer engines need (crawler access, sitemap, schema, readable content) and lists what to fix
- **Action plan:** turns the audit fixes and the prompts where AI skips you into a task list (website fixes, pages to write, sites to get featured on), and the client report shows what was done
- **Competitor and prompt discovery:** enter your brand and website, and it finds the five closest competitors and the questions customers ask AI. You review and edit before anything is saved
- **Content briefs:** for each page you need to write, a draft brief with title, outline, questions to answer, a comparison to include, and structured data, grounded in what AI answers say today
- **Answer highlights:** the full answer from each model with brand names marked
- **Client reports:** a clean report you can print as a PDF or share as a read-only link

You bring your own API key, so you pay model providers directly and nothing else.

## How it works

```
Next.js app  ──creates runs──▶  Postgres  ◀──reads runs──  Worker (pg-boss queue)
 dashboard, forms,                                          calls the models, parses
 reports, login                                             mentions and citations
```

- **Web app** (Next.js 16, Prisma 7): dashboard, settings, reports, login
- **Worker** (Node, pg-boss): runs the schedule, sends each prompt to each model, throttles requests, retries failures
- **Models** go through [OpenRouter](https://openrouter.ai), so one key covers many models. Adding another provider means writing one adapter in `src/lib/providers`

## Quick start

You need Node 20.9 or newer and a Postgres database (local, or hosted such as Neon, Supabase, or Prisma Postgres).

```bash
git clone https://github.com/<your-username>/aisoa.git
cd aisoa
npm install
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL`: a direct `postgresql://` connection string
- `OPENROUTER_API_KEY`: create a key in your OpenRouter account
- `APP_PASSWORD` and `AUTH_SECRET`: see [Login](#login)

Create the tables and add a demo project:

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Start the app and the worker in two terminals:

```bash
npm run dev       # web app on http://localhost:3000
npm run worker    # runs the queue and the schedule
```

Open the app, open the demo project, and press **Run now**. Answers appear as the worker finishes each run.

If you have Docker and want a throwaway local database:

```bash
docker run --name aisoa-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=aisoa -p 5432:5432 -d postgres:17
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aisoa"
```

## Using it

1. **New project:** enter your brand and website, press **Find competitors and prompts**, check the results, and choose the models. You can also type competitors and prompts yourself.
2. **Run now**, or let the daily schedule run. The worker must be running for either.
3. **Read the dashboard.** Use the model chips to compare answers with and without web search.
4. **Run the Website audit** to see what on the brand's site holds back AI visibility.
5. **Build the Action plan.** Suggest tasks from the results, add your own, and move them to done as the work happens. Content tasks have a **Write brief** button that drafts a brief for the page.
6. **Open the Report page** to print a PDF, or create a share link in Settings.

Tips:

- Write prompts the way a customer would ask an AI assistant. Prompts that name a brand ("Compare Asana, Trello and Linear") are left out of that brand's score, so they cannot inflate it.
- Answers change from run to run. Set **Repeats per prompt** to 3 to 5 for steadier percentages.
- The brand name must match exactly as written (`Linear` does not match the word "linear"). Other names you add match without regard to case.

## Models and cost

- Free OpenRouter models (ids ending in `:free`) cost nothing but are rate limited and have no web access, so they only show what a model remembers. Free ids change often, so check OpenRouter for current ones.
- Add `:online` to a model id (for example `some-model:free:online`) to turn on live web search. In testing this cost about $0.007 per run even on a free model, and it is what produces citations. Check OpenRouter's pricing page, since this can change.
- Runs per batch = active prompts x models x repeats. Settings shows the size of the next batch.

## Configuration

| Variable             | Purpose                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | Postgres connection string (direct `postgresql://`)                                        |
| `OPENROUTER_API_KEY` | Key used for every model call                                                              |
| `APP_PASSWORD`       | Password for the login page. Required in production                                        |
| `AUTH_SECRET`        | Secret that signs login cookies. Generate with `openssl rand -hex 32`                      |
| `DEFAULT_MODELS`     | Comma separated model ids used by the seed only                                            |
| `BRIEF_MODEL`        | Model that writes content briefs. Defaults to the project's first model, without `:online` |
| `RUN_SCHEDULE`       | Cron expression for scheduled runs, default `0 9 * * *` (UTC)                              |
| `RATE_LIMIT_MS`      | Pause between model calls, default `3500`                                                  |
| `DISPATCH_MS`        | How often the worker looks for runs created from the web app, default `5000`               |

## Login

The whole app sits behind one shared password. Set `APP_PASSWORD` and `AUTH_SECRET` and you will get a sign-in page. In development, login is off until `APP_PASSWORD` is set. In production the app refuses to serve pages without it.

Public report links (`/r/...`) work without a password. They show results only. You can reset or switch off a link in Settings.

This is a single-user login, not user accounts. If several people or clients need separate access, put the app behind your own authentication.

## Deploying

You need to run two processes against the same database:

```bash
npm run build
npm start          # web app
npm run worker     # queue and schedule
```

- Run `npx prisma migrate deploy` on each release.
- Keep the worker running all the time. Scheduled runs only happen while it is up.
- Set `APP_PASSWORD` and `AUTH_SECRET`, and serve the app over HTTPS.

## Limitations

- Answers come from models called through an API. The apps people use (ChatGPT, Gemini, Perplexity) can answer differently, so treat results as a baseline, not a guarantee.
- Mentions are found by name matching. There is no sentiment analysis yet, and answers are shown as plain text.
- One shared password, no roles or multiple users.
- The website audit checks the homepage and a few standard files. It does not crawl the whole site.
- Without web search, models cannot cite sources.

## Project layout

```
prisma/schema.prisma         data model
src/app/                     pages, forms and server actions
src/components/              shared UI pieces
src/lib/providers/           model adapters (OpenRouter)
src/lib/parser/              brand and citation matching
src/lib/dashboard.ts         dashboard queries
src/worker/                  queue consumer and scheduler
```

Useful scripts: `npm run reparse` recomputes mentions from stored answers after you change brands or matching rules. It makes no model calls.

## Development

```bash
npm test            # unit tests for matching, the audit, robots.txt parsing, and discovery
npm run typecheck   # TypeScript
```

The tests need no database or network. See `CONTRIBUTING.md` for the project layout and pull request checklist.

## Roadmap

- Sentiment for each mention
- Markdown rendering for answers
- More providers (direct OpenAI, Perplexity, Gemini)
- Content gap suggestions and a site audit for AI crawler access

## Contributing

Issues and pull requests are welcome. Open an issue first for larger changes.

## License

AGPL-3.0. See `LICENSE`. If you run a modified version as a network service, you must make your changes available under the same license.

Copyright (C) 2026 <your name>
