import PrintButton from "@/src/components/print-button";
import ReportView from "@/src/components/report-view";
import { getDashboard } from "@/src/lib/dashboard";
import prisma from "@/src/lib/prisma";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI visibility report",
  robots: { index: false, follow: false },
};

export default async function SharedReport({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await prisma.project.findUnique({
    where: { shareToken: token },
    select: { id: true },
  });
  if (!project) notFound();

  const data = await getDashboard(project.id);
  if (!data) notFound();

  return (
    <div className="report-shell">
      <div className="report-toolbar no-print">
        <PrintButton />
      </div>
      <ReportView data={data} />
    </div>
  );
}
