import { AdminOverviewClient } from "@/components/admin/admin-overview-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireAdminPage } from "@/lib/admin/auth";

export default async function AdminOverviewPage() {
  await requireAdminPage();

  return (
    <div className="min-h-dvh bg-paper">
      <AdminPageHeader
        description="A plain ledger of account growth, issued credits, collected revenue, and model usage across MicroManus."
        eyebrow="Admin ledger"
        title="Overview"
      />
      <AdminOverviewClient />
    </div>
  );
}
