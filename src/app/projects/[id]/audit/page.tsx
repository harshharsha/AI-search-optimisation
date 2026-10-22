import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { Check } from "@/src/lib/audit/checks";
import { runAudit } from "../../actions";
import { SubmitButton } from "@/src/components/submit-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { pass: "Pass", warn: "Needs work", fail: "Fix" } as const;
const IMPACT_LABEL = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
} as const;
const STATUS_ORDER = { fail: 0, warn: 1, pass: 2 } as const;
const IMPACT_ORDER = { high: 0, medium: 1, low: 2 } as const;

function CheckItem({ c }: { c: Check }) {
  return (
    <li className={`chk ${c.status}`}>
      <span className="chk-status">{STATUS_LABEL[c.status]}</span>
      <div>
        <strong>{c.label}</strong>
        <p>{c.detail}</p>
        {c.fix && c.status !== "pass" && <p className="chk-fix">{c.fix}</p>}
      </div>
      <span className="chk-impact">{IMPACT_LABEL[c.impact]}</span>
    </li>
  );
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      brands: { where: { isOwn: true } },
      audits: { orderBy: { createdAt: "desc" }, take: 2 },
    },
  });
  if (!project) notFound();

  const own = project.brands[0] ?? null;
  const [latest, previous] = project.audits;
  const checks = latest ? (latest.checks as unknown as Check[]) : [];
  const sorted = [...checks].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact],
  );
  const todo = sorted.filter((c) => c.status !== "pass");
  const passing = sorted.filter((c) => c.status === "pass");
  const delta = latest && previous ? latest.score - previous.score : null;

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${project.id}`}>{project.name}</Link>
        <span aria-hidden="true">/</span>
        <span>Website audit</span>
      </nav>

      <section className="hero">
        <h1>
          {latest
            ? `${own ? `${own.name}'s site` : "The site"} scores ${latest.score} out of 100 for AI readiness`
            : "Is the website ready for AI search?"}
        </h1>
        <p className="lede">
          {latest
            ? `${passing.length} of ${checks.length} checks pass${todo.length ? `, ${todo.length} ${todo.length === 1 ? "needs" : "need"} attention` : ""}.${
                delta !== null && delta !== 0
                  ? ` ${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} since the last audit.`
                  : ""
              }`
            : "The audit fetches the brand's website and checks what AI crawlers and answer engines depend on: crawler access, structure, structured data, and readable content."}
        </p>

        {error === "nodomain" && (
          <p className="error" role="alert">
            {own
              ? "Add the brand's website first. Open Settings, edit your brand, and fill in the Website field."
              : "Mark one brand as yours in Settings first."}{" "}
            <Link href={`/projects/${project.id}/settings`}>Open Settings</Link>
          </p>
        )}

        <div className="hero-actions">
          <form action={runAudit.bind(null, project.id)}>
            <SubmitButton pendingText="Checking the website...">
              {latest ? "Run audit again" : "Run audit"}
            </SubmitButton>
          </form>
          <Link href={`/projects/${project.id}`} className="btn">
            Back to dashboard
          </Link>
        </div>

        {latest && (
          <dl className="facts">
            <div>
              <dt>Website</dt>
              <dd>{latest.url}</dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>
                {latest.createdAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {latest && todo.length > 0 && (
        <section aria-labelledby="fix">
          <div className="panel-head">
            <h2 id="fix">Fix these first</h2>
            <p>
              Ordered by how much each one affects whether AI can find, read,
              and cite the site.
            </p>
          </div>
          <ul className="chk-list">
            {todo.map((c) => (
              <CheckItem key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      {latest && todo.length === 0 && (
        <p className="empty">Every check passes.</p>
      )}

      {latest && passing.length > 0 && (
        <details className="audit-pass">
          <summary>{passing.length} passing checks</summary>
          <ul className="chk-list">
            {passing.map((c) => (
              <CheckItem key={c.id} c={c} />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
