import { AdminCouponsClient } from "@/components/admin/admin-coupons-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireAdminPage } from "@/lib/admin/auth";

export default async function AdminCouponsPage() {
  await requireAdminPage();

  return (
    <div className="min-h-dvh bg-paper">
      <AdminPageHeader
        description="Create bounded credit grants, inspect redemption capacity, and retire codes without erasing their history."
        eyebrow="Coupon registry"
        title="Coupons"
      />
      <AdminCouponsClient />
    </div>
  );
}
