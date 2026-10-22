import { DashboardData } from "../lib/dashboard";
import { findMatches } from "../lib/parser/match";
import { buildSummary } from "../lib/summary";

const shortModel = (m: string) =>
  (m.split("/").pop() ?? m)
    .replace(":free", "")
    .replace(":online", " with web search");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmtDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

export default function ReportView({ data }: { data: DashboardData }) {
  const {
    project,
    rows,
    own,
    domains,
    opportunities,
    prompts,
    completed,
    firstRunAt,
    lastRunAt,
    brandedPrompts,
    ownDomain,
    audit,
    tasks,
  } = data;
  const { headline, lede, actions } = buildSummary(data);

  const first = fmtDate(firstRunAt);
  const last = fmtDate(lastRunAt);
  const period =
    first && last ? (first === last ? first : `${first} to ${last}`) : null;
  const maxDomain = Math.max(1, ...domains.map((d) => d.count));

  const doneTasks = tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))
    .slice(0, 10);
  const openTasks = tasks.filter((t) => t.status !== "DONE").slice(0, 8);

  const statusRank = { fail: 0, warn: 1, pass: 2 } as const;
  const impactRank = { high: 0, medium: 1, low: 2 } as const;
  const statusLabel = {
    pass: "Pass",
    warn: "Needs work",
    fail: "Fix",
  } as const;
  const auditFixes = audit
    ? audit.checks
        .filter((c) => c.status !== "pass")
        .sort(
          (a, b) =>
            statusRank[a.status] - statusRank[b.status] ||
            impactRank[a.impact] - impactRank[b.impact],
        )
        .slice(0, 6)
    : [];

  const promptRows = own
    ? prompts
        .filter((p) => p.runs.length > 0)
        .map((p) => {
          const total = p.runs.length;
          const hits = p.runs.filter((r) =>
            r.mentions.some((m) => m.brandId === own.brand.id),
          ).length;
          const inPrompt = new Set(
            findMatches(p.text, project.brands).map((m) => m.brandId),
          );
          const counts = new Map<string, number>();
          for (const r of p.runs) {
            for (const m of r.mentions) {
              if (m.brandId !== own.brand.id && !inPrompt.has(m.brandId)) {
                counts.set(m.brandId, (counts.get(m.brandId) ?? 0) + 1);
              }
            }
          }
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
          return {
            id: p.id,
            text: p.text,
            total,
            hits,
            namesOwn: inPrompt.has(own.brand.id),
            top: top
              ? (project.brands.find((b) => b.id === top[0])?.name ?? null)
              : null,
          };
        })
    : [];

  return (
    <article className="report">
      <header>
        <p className="rp-kicker">AI visibility report</p>
        <h1 className="rp-title">{project.name}</h1>
        {period && <p className="rp-meta">{period}</p>}
      </header>

      <section className="rp-summary" aria-label="Summary">
        <h2>{headline}</h2>
        <p>{lede}</p>
      </section>

      {rows.length > 0 && completed > 0 && (
        <section className="rp-sec">
          <h3>How the brands compare</h3>
          <p>
            Share of AI answers that name each brand, and where in the answer it
            first appears.
          </p>
          <table className="rp-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Named in answers</th>
                <th>Avg. position</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.brand.id} className={r.brand.isOwn ? "own" : ""}>
                  <td>
                    <strong>{r.brand.name}</strong>
                  </td>
                  <td>
                    <span className="rp-bar" aria-hidden="true">
                      <span style={{ width: `${r.rate * 100}%` }} />
                    </span>
                    {pct(r.rate)}
                  </td>
                  <td>
                    {r.avgPosition ? `#${r.avgPosition.toFixed(1)}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {brandedPrompts > 0 && (
            <p className="foot">
              {
                "Prompts that name a brand are left out of that brand's score, so they cannot inflate it."
              }
            </p>
          )}
        </section>
      )}

      {own && opportunities.length > 0 && (
        <section className="rp-sec">
          <h3>{`Where AI skips ${own.brand.name}`}</h3>
          <p>
            Prompts where recent answers rarely name the brand, and the sources
            those answers cite.
          </p>
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
                            <span key={d.domain} className="tag">
                              {d.domain}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "None cited"
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks.length > 0 ? (
        <>
          {doneTasks.length > 0 && (
            <section className="rp-sec">
              <h3>Work completed</h3>
              <ul className="rp-actions">
                {doneTasks.map((t) => (
                  <li key={t.id}>
                    {t.title}
                    {t.doneAt && (
                      <span className="muted">{` (${fmtDate(t.doneAt)})`}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {openTasks.length > 0 && (
            <section className="rp-sec">
              <h3>Planned next</h3>
              <ul className="rp-actions">
                {openTasks.map((t) => (
                  <li key={t.id}>
                    {t.title}
                    {t.status === "IN_PROGRESS" && (
                      <span className="muted"> (in progress)</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        actions.length > 0 && (
          <section className="rp-sec">
            <h3>What to do next</h3>
            <ol className="rp-actions">
              {actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </section>
        )
      )}

      {audit && (
        <section className="rp-sec">
          <h3>Website readiness</h3>
          <p>{`${audit.url} scores ${audit.score} out of 100 on the checks AI crawlers and answer engines depend on.`}</p>
          {auditFixes.length > 0 ? (
            <ul className="chk-list">
              {auditFixes.map((c) => (
                <li key={c.id} className={`chk ${c.status}`}>
                  <span className="chk-status">{statusLabel[c.status]}</span>
                  <div>
                    <strong>{c.label}</strong>
                    <p>{c.detail}</p>
                    {c.fix && <p className="chk-fix">{c.fix}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>All checks pass.</p>
          )}
        </section>
      )}

      {domains.length > 0 && (
        <section className="rp-sec">
          <h3>Sources AI relies on</h3>
          <p>Websites cited most often in the answers.</p>
          <ul className="domains rp-domains">
            {domains.map((d) => (
              <li key={d.domain} className={d.brand?.isOwn ? "is-own" : ""}>
                <span className="d-name">
                  {d.domain}
                  {d.brand && (
                    <span className="chip">
                      {d.brand.isOwn ? own?.brand.name : d.brand.name}
                    </span>
                  )}
                </span>
                <span className="d-bar">
                  <span style={{ width: `${(d.count / maxDomain) * 100}%` }} />
                </span>
                <span className="d-count">{d.count}</span>
              </li>
            ))}
          </ul>
          {ownDomain && !domains.some((d) => d.domain.endsWith(ownDomain)) && (
            <p className="foot">{`${ownDomain} was not among the most cited sources.`}</p>
          )}
        </section>
      )}

      {promptRows.length > 0 && own && (
        <section className="rp-sec">
          <h3>Prompt by prompt</h3>
          <p>{`How often ${own.brand.name} is named for each question, and who is named most often instead.`}</p>
          <table className="rp-table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th>{`${own.brand.name} named`}</th>
                <th>Most named competitor</th>
              </tr>
            </thead>
            <tbody>
              {promptRows.map((p) => (
                <tr key={p.id}>
                  <td>{p.text}</td>
                  <td>
                    {p.namesOwn ? (
                      <span className="muted">Names the brand</span>
                    ) : (
                      `${p.hits} of ${p.total}`
                    )}
                  </td>
                  <td>{p.top ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="rp-sec rp-about">
        <h3>About this report</h3>
        <p>
          {`Based on ${completed} AI answers to ${prompts.length} prompts from ${project.models
            .map(shortModel)
            .join(
              ", ",
            )}. A brand counts as named when its name appears in an answer. These answers come from AI models called through an API, so the apps people use (ChatGPT, Gemini, Perplexity) may answer differently. Results vary from run to run, which is why each prompt is repeated.`}
        </p>
      </footer>
    </article>
  );
}
