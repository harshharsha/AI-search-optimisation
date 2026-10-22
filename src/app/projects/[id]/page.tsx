import { getDashboard, isWeb } from "@/src/lib/dashboard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { retryFailed, runNow } from "../actions";
import { SubmitButton } from "@/src/components/submit-button";
import { segmentAnswer } from "@/src/lib/parser/highlight";
import AutoRefresh from "@/src/components/auto-refresh";

export const dynamic = "force-dynamic";

const shortModel = (m: string) =>
  (m.split("/").pop() ?? m).replace(":free", "").replace(":online", " + web");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function timeAgo(d: Date) {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

function Sparkline({
  values,
  own,
}: {
  values: (number | null)[];
  own: boolean;
}) {
  const w = 104;
  const h = 30;
  const pad = 3;
  const pts = values
    .map((v, i) =>
      v === null
        ? null
        : ([
            pad + (i * (w - 2 * pad)) / (values.length - 1),
            h - pad - v * (h - 2 * pad),
          ] as const),
    )
    .filter((p): p is readonly [number, number] => p !== null);

  return (
    <svg
      className={`spark ${own ? "spark-own" : ""}`}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      {pts.length > 1 ? (
        <path
          d={pts
            .map(
              ([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`,
            )
            .join(" ")}
        />
      ) : pts.length === 1 ? (
        <circle cx={pts[0][0]} cy={pts[0][1]} r="2.5" />
      ) : null}
    </svg>
  );
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queued?: string; model?: string }>;
}) {
  const { id } = await params;
  const { queued: queuedParam, model: modelParam } = await searchParams;
  const data = await getDashboard(id, modelParam);
  if (!data) notFound();

  const {
    project,
    filter,
    activeModels,
    completed,
    queued,
    failed,
    lastRunAt,
    rows,
    own,
    ownRank,
    ownDomain,
    domains,
    opportunities,
    brandedPrompts,
    prompts,
    days,
    lastError,
  } = data;
  const leader = rows[0];

  const hasWeb = project.models.some(isWeb);
  const hasMemory = project.models.some((m) => !isWeb(m));
  const filterOptions = [
    { value: "all", label: "All models" },
    ...(hasWeb && hasMemory
      ? [
          { value: "web", label: "With web search" },
          { value: "memory", label: "Memory only" },
        ]
      : []),
    ...project.models.map((m) => ({ value: m, label: shortModel(m) })),
  ];

  let headline: string;
  let lede: string;
  if (completed === 0) {
    headline = "No results yet";
    lede =
      "Press Run now, with the worker running. Results appear here as each model answers.";
  } else if (own && ownRank) {
    headline = `${own.brand.name} appears in ${pct(own.rate)} of AI answers`;
    lede =
      ownRank === 1
        ? `You lead ${rows.length - 1} tracked competitors.`
        : `Ranked ${ordinal(ownRank)} of ${rows.length} tracked brands. ${leader.brand.name} leads at ${pct(leader.rate)}.`;
  } else {
    headline = `${leader.brand.name} leads at ${pct(leader.rate)} of AI answers`;
    lede =
      "Mark one brand as yours in Settings to see how you rank against the rest.";
  }

  const maxDomain = Math.max(1, ...domains.map((d) => d.count));

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <span>{project.name}</span>
      </nav>

      <section className="hero">
        <h1>{headline}</h1>
        <p className="lede">{lede}</p>
        <div className="hero-actions">
          <form action={runNow.bind(null, project.id)}>
            <SubmitButton pendingText="Queuing runs...">Run now</SubmitButton>
          </form>
          <Link href={`/projects/${project.id}/plan`} className="btn">
            Action plan
          </Link>
          <Link href={`/projects/${project.id}/audit`} className="btn">
            Website audit
          </Link>
          <Link href={`/projects/${project.id}/report`} className="btn">
            Report
          </Link>
          <Link href={`/projects/${project.id}/settings`} className="btn">
            Settings
          </Link>
        </div>
        {queuedParam !== undefined && (
          <p className="notice" role="status">
            {Number(queuedParam) > 0
              ? `Queued ${queuedParam} runs. The worker (npm run worker) picks them up within a few seconds, and this page refreshes as answers arrive.`
              : "Nothing to run. Add at least one active prompt and one model in Settings."}
          </p>
        )}
        {failed > 0 && (
          <div className="error" role="alert">
            <p>
              {failed} {failed === 1 ? "run" : "runs"} failed.
              {lastError ? ` Latest error: ${lastError}` : ""}
            </p>
            <form action={retryFailed.bind(null, project.id)}>
              <SubmitButton className="btn btn-small" pendingText="Retrying...">
                Retry failed runs
              </SubmitButton>
            </form>
          </div>
        )}
        <dl className="facts">
          <div>
            <dt>Completed runs</dt>
            <dd>{completed}</dd>
          </div>
          <div>
            <dt>Prompts</dt>
            <dd>{prompts.length}</dd>
          </div>
          <div>
            <dt>Models</dt>
            <dd>{project.models.length}</dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd>{lastRunAt ? timeAgo(lastRunAt) : "Never"}</dd>
          </div>
          {queued > 0 && (
            <div>
              <dt>In queue</dt>
              <dd>{queued}</dd>
            </div>
          )}
          {failed > 0 && (
            <div className="warn">
              <dt>Failed</dt>
              <dd>{failed}</dd>
            </div>
          )}
        </dl>

        {project.models.length > 1 && (
          <nav className="filters" aria-label="Filter results by model">
            {filterOptions.map((f) => (
              <Link
                key={f.value}
                href={
                  f.value === "all"
                    ? `/projects/${project.id}`
                    : `/projects/${project.id}?model=${encodeURIComponent(f.value)}`
                }
                className={`fchip ${filter === f.value ? "on" : ""}`}
                aria-current={filter === f.value ? "true" : undefined}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        )}
      </section>

      <div className="grid">
        <section className="panel" aria-labelledby="sov">
          <div className="panel-head">
            <h2 id="sov">Share of voice</h2>
            <p>How often each brand is named in an answer.</p>
          </div>
          <div className="lb-cols" aria-hidden="true">
            <span>Brand</span>
            <span>Mentioned in answers</span>
            <span>Avg. position</span>
            <span>Last {days} days</span>
          </div>
          <ol className="lb">
            {rows.map((r, i) => {
              const isOwn = r.brand.isOwn;
              return (
                <li
                  key={r.brand.id}
                  className={`lb-row ${isOwn ? "is-own" : ""}`}
                >
                  <span className="lb-rank">{i + 1}</span>
                  <span className="lb-name">
                    {r.brand.name}
                    {isOwn && <span className="chip">You</span>}
                  </span>
                  <span
                    className="lb-bar"
                    role="img"
                    aria-label={`${r.brand.name} mentioned in ${pct(r.rate)} of answers`}
                  >
                    <span
                      style={{
                        width: `${Math.max(r.rate * 100, r.rate > 0 ? 2 : 0)}%`,
                      }}
                    />
                    <b>{pct(r.rate)}</b>
                  </span>
                  <span className="lb-pos">
                    {r.avgPosition ? `#${r.avgPosition.toFixed(1)}` : "–"}
                  </span>
                  <Sparkline values={r.trend} own={isOwn} />
                </li>
              );
            })}
          </ol>
          {brandedPrompts > 0 && (
            <p className="foot">
              {
                "Prompts that name a brand are left out of that brand's score, so a question like Compare Asana, Trello and Linear cannot inflate them."
              }
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="src">
          <div className="panel-head">
            <h2 id="src">Sources models cite</h2>
            <p>Domains that appear most in answers.</p>
          </div>
          {domains.length === 0 ? (
            <p className="empty">
              No citations yet. Models without web access rarely cite sources.
              Add :online to a model id in Settings to turn on web search.
            </p>
          ) : (
            <ul className="domains">
              {domains.map((d) => (
                <li key={d.domain} className={d.brand?.isOwn ? "is-own" : ""}>
                  <span className="d-name">
                    {d.domain}
                    {d.brand && (
                      <span className="chip">
                        {d.brand.isOwn ? "You" : d.brand.name}
                      </span>
                    )}
                  </span>
                  <span className="d-bar">
                    <span
                      style={{ width: `${(d.count / maxDomain) * 100}%` }}
                    />
                  </span>
                  <span className="d-count">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {own && completed > 0 && (
        <section className="opps" aria-labelledby="opp">
          <div className="panel-head">
            <h2 id="opp">Where AI skips you</h2>
            <p>
              Prompts where recent answers rarely name you, and the sources
              those answers cite.
            </p>
          </div>
          {opportunities.length === 0 ? (
            <p className="empty">
              No gaps right now. Recent answers name you for most prompts.
            </p>
          ) : (
            <ul className="opp-list">
              {opportunities.map((o) => (
                <li key={o.prompt.id} className="opp">
                  <div className="opp-main">
                    <strong>{o.prompt.text}</strong>
                    <span className="opp-stat">
                      Named in {o.hits} of {o.total}{" "}
                      {o.total === 1 ? "answer" : "answers"}
                    </span>
                  </div>
                  <dl className="opp-detail">
                    <div>
                      <dt>Named instead</dt>
                      <dd>
                        {o.named.length
                          ? o.named.map((n) => n.brand.name).join(", ")
                          : "No tracked competitor"}
                      </dd>
                    </div>
                    <div>
                      <dt>Sources cited</dt>
                      <dd>
                        {o.domains.length ? (
                          <span className="tags">
                            {o.domains.map((d) => (
                              <span
                                key={d.domain}
                                className={`tag ${ownDomain && d.domain.endsWith(ownDomain) ? "own" : ""}`}
                              >
                                {d.domain}
                              </span>
                            ))}
                          </span>
                        ) : (
                          "None cited. Use a web-search model to see where answers come from."
                        )}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="prompts-sec" aria-labelledby="prm">
        <div className="panel-head">
          <h2 id="prm">Prompts</h2>
          <p>Open a prompt to read the latest answer from each model.</p>
        </div>

        {prompts.length === 0 ? (
          <p className="empty">
            No prompts yet. Add some in{" "}
            <Link href={`/projects/${project.id}/settings`}>Settings</Link>.
          </p>
        ) : (
          <ul className="prompts">
            {prompts.map((p) => {
              const perModel = activeModels.map((model) => ({
                model,
                run: p.runs.find((r) => r.model === model) ?? null,
              }));
              return (
                <li key={p.id}>
                  <details>
                    <summary>
                      <span className="p-text">{p.text}</span>
                      <span className="p-chips">
                        {perModel.map(({ model, run }) => {
                          const hit = own
                            ? run?.mentions.find(
                                (m) => m.brandId === own.brand.id,
                              )
                            : null;
                          const state = !run ? "none" : hit ? "hit" : "miss";
                          return (
                            <span
                              key={model}
                              className={`mchip ${state}`}
                              title={model}
                            >
                              {shortModel(model)}
                              <b>
                                {!run
                                  ? "pending"
                                  : hit
                                    ? `#${hit.position}`
                                    : "not named"}
                              </b>
                            </span>
                          );
                        })}
                      </span>
                    </summary>

                    <div className="answers">
                      {perModel.map(({ model, run }) => {
                        if (!run?.rawText) return null;
                        const segs = segmentAnswer(run.rawText, project.brands);
                        const cited = [
                          ...new Set(run.citations.map((c) => c.domain)),
                        ];
                        return (
                          <article key={model} className="ans">
                            <header>
                              <strong>{shortModel(model)}</strong>
                              <span>
                                {timeAgo(run.finishedAt ?? run.createdAt)}
                              </span>
                            </header>
                            <p className="ans-text">
                              {segs.map((s, i) =>
                                s.brandId ? (
                                  <mark
                                    key={i}
                                    className={
                                      s.brandId === own?.brand.id
                                        ? "mk own"
                                        : "mk"
                                    }
                                  >
                                    {s.text}
                                  </mark>
                                ) : (
                                  <span key={i}>{s.text}</span>
                                ),
                              )}
                            </p>
                            {cited.length > 0 && (
                              <p className="ans-src">
                                Cited: {cited.join(", ")}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {queued > 0 && <AutoRefresh />}
    </main>
  );
}
