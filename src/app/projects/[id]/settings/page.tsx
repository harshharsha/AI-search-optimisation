import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import {
  addBrand,
  addPrompts,
  deleteBrand,
  deleteProject,
  deletePrompt,
  disableSharing,
  discoverForProject,
  enableSharing,
  makeOwnBrand,
  saveProject,
  togglePrompt,
  updateBrand,
} from "../../actions";
import { SubmitButton } from "@/src/components/submit-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ found?: string; prompts?: string; error?: string }>;
}) {
  const { id } = await params;
  const { found, prompts: promptsAdded, error } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      brands: { orderBy: { createdAt: "asc" } },
      prompts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = project.shareToken
    ? `${proto}://${host}/r/${project.shareToken}`
    : null;

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${project.id}`}>{project.name}</Link>
        <span aria-hidden="true">/</span>
        <span>Settings</span>
      </nav>

      <section className="hero">
        <h1 className="page-title">Settings</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {found !== undefined && (
          <p className="notice" role="status">
            {`Added ${found} ${Number(found) === 1 ? "competitor" : "competitors"} and ${promptsAdded ?? 0} ${Number(promptsAdded ?? 0) === 1 ? "prompt" : "prompts"}. Check them below, then press Run now on the dashboard to measure.`}
          </p>
        )}
      </section>

      <section className="set-sec">
        <div>
          <h2>Project</h2>
          <p>The name, and the models every prompt runs against.</p>
        </div>
        <form action={saveProject.bind(null, project.id)} className="form">
          <div className="field">
            <label htmlFor="name">Project name</label>
            <input id="name" name="name" defaultValue={project.name} required />
          </div>
          <div className="field">
            <label htmlFor="models">Models</label>
            <textarea
              id="models"
              name="models"
              rows={4}
              defaultValue={project.models.join("\n")}
              required
            />
            <p className="hint">
              One OpenRouter model id per line. Add :online to turn on live web
              search (about $0.007 per run). Free model ids change often: check
              openrouter.ai/models?q=free. New runs use the updated list.
            </p>
          </div>
          <div className="field">
            <label htmlFor="repeats">Repeats per prompt</label>
            <input
              id="repeats"
              name="repeats"
              type="number"
              min={1}
              max={10}
              defaultValue={project.repeats}
            />
            <p className="hint">
              Each prompt runs this many times per model. Answers change from
              run to run, so 3 to 5 gives steadier percentages. Next batch:{" "}
              {project.prompts.filter((p) => p.active).length *
                project.models.length *
                project.repeats}{" "}
              runs.
            </p>
          </div>
          <div className="form-actions">
            <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
          </div>
        </form>
      </section>

      <section className="set-sec">
        <div>
          <h2>Brands</h2>
          <p>Mark one brand as yours. The rest count as competitors.</p>
        </div>
        <div>
          <form
            action={discoverForProject.bind(null, project.id)}
            className="form discover"
          >
            <p className="hint">
              Finds the five closest competitors and suggests prompts, using
              your brand&apos;s website. Brands and prompts you already have are
              kept. Models can guess wrong, so check what it adds.
            </p>
            <div className="form-actions">
              <SubmitButton
                className="btn"
                pendingText="Finding competitors..."
              >
                Find competitors and prompts
              </SubmitButton>
            </div>
          </form>
          <ul className="items">
            {project.brands.map((b) => (
              <li key={b.id}>
                <span className="item-main">
                  <strong>
                    {b.name}
                    {b.isOwn && <span className="chip">You</span>}
                  </strong>
                  <span className="item-sub">
                    {[
                      b.domain,
                      b.aliases.length
                        ? `Also matches: ${b.aliases.join(", ")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(". ") || "No website set"}
                  </span>
                </span>
                <span className="item-actions">
                  {!b.isOwn && (
                    <form action={makeOwnBrand.bind(null, b.id)}>
                      <SubmitButton
                        className="btn btn-small"
                        pendingText="Saving..."
                      >
                        Make mine
                      </SubmitButton>
                    </form>
                  )}
                  <form action={deleteBrand.bind(null, b.id)}>
                    <SubmitButton
                      className="btn btn-small btn-danger"
                      pendingText="Removing..."
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </span>
                <details className="item-edit">
                  <summary>Edit</summary>
                  <form action={updateBrand.bind(null, b.id)} className="form">
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor={`bn-${b.id}`}>Name</label>
                        <input
                          id={`bn-${b.id}`}
                          name="name"
                          defaultValue={b.name}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`bd-${b.id}`}>Website</label>
                        <input
                          id={`bd-${b.id}`}
                          name="domain"
                          defaultValue={b.domain ?? ""}
                          placeholder="example.com"
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={`ba-${b.id}`}>Other names</label>
                      <input
                        id={`ba-${b.id}`}
                        name="aliases"
                        defaultValue={b.aliases.join(", ")}
                      />
                      <p className="hint">
                        Saving also recalculates past results with the new
                        names.
                      </p>
                    </div>
                    <div className="form-actions">
                      <SubmitButton pendingText="Saving...">
                        Save brand
                      </SubmitButton>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>

          <form action={addBrand.bind(null, project.id)} className="form">
            <div className="field-row">
              <div className="field">
                <label htmlFor="b-name">Brand name</label>
                <input id="b-name" name="name" required placeholder="Monday" />
              </div>
              <div className="field">
                <label htmlFor="b-domain">Website</label>
                <input id="b-domain" name="domain" placeholder="monday.com" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="b-aliases">Other names</label>
              <input
                id="b-aliases"
                name="aliases"
                placeholder="Monday.com, monday work management"
              />
              <p className="hint">
                Comma separated. The brand name must match exactly as written,
                so Linear does not match the word linear. Other names ignore
                case, so add variants like linear.app here.
              </p>
            </div>
            <div className="form-actions">
              <SubmitButton pendingText="Adding...">Add brand</SubmitButton>
            </div>
          </form>
        </div>
      </section>

      <section className="set-sec">
        <div>
          <h2>Prompts</h2>
          <p>
            The questions asked of every model. Pause one to skip it in future
            runs.
          </p>
        </div>
        <div>
          {project.prompts.length === 0 ? (
            <p className="empty">No prompts yet. Add some below.</p>
          ) : (
            <ul className="items">
              {project.prompts.map((p) => (
                <li key={p.id}>
                  <span className="item-main">
                    <strong className={p.active ? "" : "is-off"}>
                      {p.text}
                    </strong>
                    {!p.active && (
                      <span className="item-sub">
                        Paused. Skipped in new runs.
                      </span>
                    )}
                  </span>
                  <span className="item-actions">
                    <form action={togglePrompt.bind(null, p.id)}>
                      <SubmitButton
                        className="btn btn-small"
                        pendingText="Saving..."
                      >
                        {p.active ? "Pause" : "Resume"}
                      </SubmitButton>
                    </form>
                    <form action={deletePrompt.bind(null, p.id)}>
                      <SubmitButton
                        className="btn btn-small btn-danger"
                        pendingText="Removing..."
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form action={addPrompts.bind(null, project.id)} className="form">
            <div className="field">
              <label htmlFor="prompts">Add prompts</label>
              <textarea
                id="prompts"
                name="prompts"
                rows={4}
                placeholder={
                  "Which issue tracker is best for a 10 person team?\nLinear vs Jira for startups"
                }
              />
              <p className="hint">One per line.</p>
            </div>
            <div className="form-actions">
              <SubmitButton pendingText="Adding...">Add prompts</SubmitButton>
            </div>
          </form>
        </div>
      </section>

      <section className="set-sec">
        <div>
          <h2>Client report</h2>
          <p>A clean summary you can print as a PDF or share as a link.</p>
        </div>
        <div className="form">
          <div className="form-actions">
            <Link
              href={`/projects/${project.id}/report`}
              className="btn btn-primary"
            >
              Open report
            </Link>
          </div>

          {shareUrl ? (
            <>
              <div className="field">
                <label htmlFor="share-url">Public link</label>
                <input id="share-url" readOnly value={shareUrl} />
                <p className="hint">
                  Anyone with this link can read the report. It shows results
                  only, not settings or other projects.
                </p>
              </div>
              <div className="form-actions">
                <form action={enableSharing.bind(null, project.id)}>
                  <SubmitButton
                    className="btn btn-small"
                    pendingText="Resetting..."
                  >
                    Reset link
                  </SubmitButton>
                </form>
                <form action={disableSharing.bind(null, project.id)}>
                  <SubmitButton
                    className="btn btn-small btn-danger"
                    pendingText="Stopping..."
                  >
                    Stop sharing
                  </SubmitButton>
                </form>
              </div>
            </>
          ) : (
            <form
              action={enableSharing.bind(null, project.id)}
              className="form"
            >
              <p className="hint">
                Create a public link to send to a client. You can switch it off
                at any time.
              </p>
              <div className="form-actions">
                <SubmitButton pendingText="Creating...">
                  Create share link
                </SubmitButton>
              </div>
            </form>
          )}
          <p className="hint">
            The rest of this app has no login. Before putting it on a public
            server, add authentication so only the shared report link is
            reachable.
          </p>
        </div>
      </section>

      <section className="set-sec">
        <div>
          <h2>Delete project</h2>
          <p>Removes the project with all its brands, prompts, and results.</p>
        </div>
        <details className="danger">
          <summary>Delete this project</summary>
          <p className="hint">This cannot be undone.</p>
          <form action={deleteProject.bind(null, project.id)}>
            <SubmitButton className="btn btn-danger" pendingText="Deleting...">
              Delete {project.name}
            </SubmitButton>
          </form>
        </details>
      </section>
    </main>
  );
}
