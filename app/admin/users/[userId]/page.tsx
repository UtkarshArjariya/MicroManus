import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminUserDetailClient } from "@/components/admin/admin-user-detail-client";
import { requireAdminPage } from "@/lib/admin/auth";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdminPage();
  const { userId } = await params;

  return (
    <div className="min-h-dvh bg-paper">
      <AdminPageHeader
        description="Review this account's balance history, chats, tracked cost, and safe provider-key metadata."
        eyebrow="User ledger"
        title="Account detail"
      />
      <AdminUserDetailClient userId={userId} />
    </div>
  );
}
