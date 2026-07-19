import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/lib/admin/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return <AdminShell user={admin}>{children}</AdminShell>;
}
