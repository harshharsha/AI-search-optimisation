import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/src/lib/prisma";
import { generateBrief } from "../../../actions";
import { SubmitButton } from "@/src/components/submit-button";
import CopyButton from "@/src/components/copy-button";

export const dynamic = "force-dynamic";

const shortModel = (m: string) =>
  (m.split("/").pop() ?? m).replace(":free", "");

export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, taskId } = await params;
  const { error } = await searchParams;

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId: id },
    include: { project: { select: { name: true } } },
  });
  if (!task) notFound();

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${id}`}>{task.project.name}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${id}/plan`}>Action plan</Link>
        <span aria-hidden="true">/</span>
        <span>Brief</span>
      </nav>

      <section className="hero">
        <h1 className="page-title">{task.title}</h1>
        <p className="lede">
          {task.brief && task.briefAt
            ? `Draft written ${task.briefAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} by ${shortModel(task.briefModel ?? "a model")}. Check every fact before publishing.`
            : "Generate a draft brief for this page: title, outline, questions to answer, a comparison to include, and structured data. It uses what AI answers say today about this question."}
        </p>

        {error && (
          <p className="error" role="alert">
            {error === "nomodel"
              ? "No model is set. Add one in Settings first."
              : `The brief could not be written: ${error}`}
          </p>
        )}

        <div className="hero-actions">
          <form action={generateBrief.bind(null, task.id)}>
            <SubmitButton pendingText="Writing the brief. This can take a minute...">
              {task.brief ? "Write again" : "Write brief"}
            </SubmitButton>
          </form>
          {task.brief && <CopyButton text={task.brief} />}
          <Link href={`/projects/${id}/plan`} className="btn">
            Back to plan
          </Link>
        </div>
      </section>

      {task.brief && (
        <article className="brief">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {task.brief}
          </ReactMarkdown>
        </article>
      )}
    </main>
  );
}
