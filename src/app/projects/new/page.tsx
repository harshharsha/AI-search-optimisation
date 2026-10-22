import NewProjectForm from "@/src/components/new-project-form";
import Link from "next/link";

const errors: Record<string, string> = {
  missing: "Add your brand name.",
  models: "Add at least one model id.",
};

export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <span>New project</span>
      </nav>

      <section className="hero">
        <h1 className="page-title">New project</h1>
        <p className="lede">
          Enter your brand and website. The app finds your top competitors and
          the questions customers ask AI, and you can change anything before you
          create the project.
        </p>
      </section>

      {error && errors[error] && (
        <p className="error" role="alert">
          {errors[error]}
        </p>
      )}

      <NewProjectForm />
    </main>
  );
}
