import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import {
  addTask,
  deleteTask,
  setTaskStatus,
  suggestTasks,
} from "../../actions";
import { SubmitButton } from "@/src/components/submit-button";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  WEBSITE: "Website",
  CONTENT: "Content",
  OUTREACH: "Outreach",
  OTHER: "Other",
} as const;
const fmt = (d: Date) =>
  d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { id } = await params;
  const { added } = await searchParams;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { tasks: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) notFound();

  const todo = project.tasks.filter((t) => t.status === "TODO");
  const doing = project.tasks.filter((t) => t.status === "IN_PROGRESS");
  const done = project.tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));
  const open = todo.length + doing.length;

  const sections = [
    { key: "doing", title: "In progress", tasks: doing },
    { key: "todo", title: "To do", tasks: todo },
    { key: "done", title: "Done", tasks: done },
  ] as const;

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${project.id}`}>{project.name}</Link>
        <span aria-hidden="true">/</span>
        <span>Action plan</span>
      </nav>

      <section className="hero">
        <h1>
          {open === 0
            ? "No open tasks"
            : `${open} open ${open === 1 ? "task" : "tasks"}`}
        </h1>
        <p className="lede">
          The work that raises visibility: fixes on the website, pages to write,
          and sites to get featured on. Suggest tasks from the latest results,
          or add your own. The client report shows what is done and what is
          planned.
        </p>

        {added !== undefined && (
          <p className="notice" role="status">
            {Number(added) > 0
              ? `Added ${added} suggested ${Number(added) === 1 ? "task" : "tasks"}.`
              : "Nothing new to suggest. Run the website audit and the prompts first, so there are gaps to work on."}
          </p>
        )}

        <div className="hero-actions">
          <form action={suggestTasks.bind(null, project.id)}>
            <SubmitButton pendingText="Reading the results...">
              Suggest tasks from results
            </SubmitButton>
          </form>
          <Link href={`/projects/${project.id}`} className="btn">
            Back to dashboard
          </Link>
        </div>
      </section>

      {project.tasks.length === 0 && (
        <p className="empty">
          No tasks yet. Suggest tasks from the results, or add one below.
        </p>
      )}

      {sections.map(
        (s) =>
          s.tasks.length > 0 && (
            <section
              key={s.key}
              className="plan-sec"
              aria-labelledby={`h-${s.key}`}
            >
              <div className="panel-head">
                <h2 id={`h-${s.key}`}>
                  {s.title} <span className="count">{s.tasks.length}</span>
                </h2>
              </div>
              <ul className="items">
                {s.tasks.map((t) => (
                  <li key={t.id}>
                    <span className="item-main">
                      <strong>{t.title}</strong>
                      <span className="item-sub">
                        <span className="tag">{KIND_LABEL[t.kind]}</span>
                        {t.detail ? ` ${t.detail}` : ""}
                        {t.status === "DONE" && t.doneAt
                          ? ` Done ${fmt(t.doneAt)}.`
                          : ""}
                      </span>
                    </span>
                    <span className="item-actions">
                      {t.kind === "CONTENT" && (
                        <Link
                          href={`/projects/${project.id}/plan/${t.id}`}
                          className="btn btn-small"
                        >
                          {t.brief ? "View brief" : "Write brief"}
                        </Link>
                      )}
                      {t.status === "TODO" && (
                        <form
                          action={setTaskStatus.bind(null, t.id, "IN_PROGRESS")}
                        >
                          <SubmitButton
                            className="btn btn-small"
                            pendingText="Saving..."
                          >
                            Start
                          </SubmitButton>
                        </form>
                      )}
                      {t.status !== "DONE" && (
                        <form action={setTaskStatus.bind(null, t.id, "DONE")}>
                          <SubmitButton
                            className="btn btn-small"
                            pendingText="Saving..."
                          >
                            Done
                          </SubmitButton>
                        </form>
                      )}
                      {t.status === "IN_PROGRESS" && (
                        <form action={setTaskStatus.bind(null, t.id, "TODO")}>
                          <SubmitButton
                            className="btn btn-small"
                            pendingText="Saving..."
                          >
                            Back to to do
                          </SubmitButton>
                        </form>
                      )}
                      {t.status === "DONE" && (
                        <form action={setTaskStatus.bind(null, t.id, "TODO")}>
                          <SubmitButton
                            className="btn btn-small"
                            pendingText="Saving..."
                          >
                            Reopen
                          </SubmitButton>
                        </form>
                      )}
                      <form action={deleteTask.bind(null, t.id)}>
                        <SubmitButton
                          className="btn btn-small btn-danger"
                          pendingText="Removing..."
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      <section className="plan-sec" aria-labelledby="h-add">
        <div className="panel-head">
          <h2 id="h-add">Add a task</h2>
        </div>
        <form action={addTask.bind(null, project.id)} className="form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="t-title">Task</label>
              <input
                id="t-title"
                name="title"
                required
                placeholder="Pitch a comparison article to zapier.com"
              />
            </div>
            <div className="field">
              <label htmlFor="t-kind">Type</label>
              <select id="t-kind" name="kind" defaultValue="OTHER">
                <option value="WEBSITE">Website</option>
                <option value="CONTENT">Content</option>
                <option value="OUTREACH">Outreach</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="t-detail">Notes</label>
            <textarea id="t-detail" name="detail" rows={3} />
          </div>
          <div className="form-actions">
            <SubmitButton pendingText="Adding...">Add task</SubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}
