import PrintButton from "@/src/components/print-button";
import ReportView from "@/src/components/report-view";
import { getDashboard } from "@/src/lib/dashboard";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDashboard(id);
  if (!data) notFound();

  return (
    <div className="report-shell">
      <div className="report-toolbar no-print">
        <Link href={`/projects/${id}`} className="btn">
          Back to dashboard
        </Link>
        <PrintButton />
      </div>
      <ReportView data={data} />
    </div>
  );
}
