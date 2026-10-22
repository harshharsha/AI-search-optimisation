# Contributing

Thanks for helping. Issues and pull requests are welcome. For a larger change, open an issue first so we can agree on the approach.

## Set up

Follow the quick start in the README, then:

```bash
npm test            # unit tests (no database needed)
npm run typecheck   # TypeScript
npm run dev         # web app
npm run worker      # queue and schedule
```

## Where things live

- `src/lib/parser/`: brand matching and mention parsing. Change matching rules here, and add a test in `match.test.ts`.
- `src/lib/audit/`: the website audit (`checks.ts`), the robots.txt parser, and the safe fetcher that refuses private addresses.
- `src/lib/providers/`: model adapters. To add a provider, implement the `Provider` interface and route to it in `index.ts`.
- `src/lib/discovery.ts`: competitor and prompt discovery.
- `src/app/projects/actions.ts`: server actions behind the forms.
- `src/worker/`: the queue consumer and scheduler.

## Pull requests

- Keep each PR focused on one change.
- Add or update tests for logic changes. The pure logic in `src/lib` is tested with Vitest, using mocked network calls.
- Run `npm test` and `npm run typecheck` before you push.
- If you change `prisma/schema.prisma`, include the migration (`npx prisma migrate dev --name what_changed`).
- Describe what changed and why, and include a screenshot for UI changes.

## License

This project is licensed under AGPL-3.0. By sending a contribution you agree that it is released under the same license.

## Reporting a security problem

Please do not open a public issue. See `SECURITY.md`.
