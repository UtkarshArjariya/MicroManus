import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { requireAdminPage } from "@/lib/admin/auth";

export default async function AdminUsersPage() {
  await requireAdminPage();

  return (
    <div className="min-h-dvh bg-paper">
      <AdminPageHeader
        description="Search account records, compare balances and tracked spend, and open a user ledger for closer review."
        eyebrow="Account registry"
        title="Users"
      />
      <AdminUsersClient />
    </div>
  );
}
