import Link from "next/link";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      brands: { select: { name: true, isOwn: true } },
      _count: { select: { prompts: true, runs: true } },
    },
  });

  return (
    <main className="page">
      <section className="hero">
        <h1>Is AI recommending your brand?</h1>
        <p className="lede">
          Track how often AI models name you, your competitors, and the sources
          they cite.
        </p>
        <div className="hero-actions">
          <Link href="/projects/new" className="btn btn-primary">
            New project
          </Link>
        </div>
      </section>

      {projects.length === 0 ? (
        <p className="empty">No projects yet. Create one to start tracking.</p>
      ) : (
        <ul className="projects">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}>
                <span className="pj-name">{p.name}</span>
                <span className="pj-brands">
                  {p.brands.map((b) => b.name).join(", ")}
                </span>
                <span className="pj-stats">
                  {p._count.prompts} prompts, {p._count.runs} runs
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
