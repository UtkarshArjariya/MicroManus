"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Power, PowerOff, Ticket } from "lucide-react";

import { adminApi, formatAdminDate, formatAdminNumber } from "@/components/admin/admin-api";
import { InterfaceNotice } from "@/components/interface-notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminCoupon } from "@/lib/admin/types";

type CouponsResponse = { coupons: AdminCoupon[] };

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function couponCapacity(coupon: AdminCoupon) {
  return coupon.maxRedemptions === null
    ? `${formatAdminNumber(coupon.redemptionCount)} / unlimited`
    : `${formatAdminNumber(coupon.redemptionCount)} / ${formatAdminNumber(coupon.maxRedemptions)}`;
}

function CouponEditor({
  coupon,
  onCancel,
  onSaved,
}: {
  coupon: AdminCoupon | null;
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [creditValue, setCreditValue] = useState(String(coupon?.creditValue ?? 5));
  const [maxRedemptions, setMaxRedemptions] = useState(coupon?.maxRedemptions?.toString() ?? "");
  const [expiresAt, setExpiresAt] = useState(toLocalDateTime(coupon?.expiresAt ?? null));
  const [active, setActive] = useState(coupon?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedCredits = Number(creditValue);
    const parsedMaximum = maxRedemptions === "" ? null : Number(maxRedemptions);

    if (!Number.isInteger(parsedCredits) || parsedCredits <= 0) {
      setError("Credit value must be a positive whole number.");
      return;
    }

    if (parsedMaximum !== null && (!Number.isInteger(parsedMaximum) || parsedMaximum <= 0)) {
      setError("Maximum redemptions must be a positive whole number, or left blank for unlimited.");
      return;
    }

    if (coupon && parsedMaximum !== null && parsedMaximum < coupon.redemptionCount) {
      setError(`Maximum redemptions cannot be lower than the ${coupon.redemptionCount} already recorded.`);
      return;
    }

    const cleanCode = code.trim();
    if (!coupon && !cleanCode) {
      setError("Enter a coupon code.");
      return;
    }

    const payload = {
      ...(!coupon ? { code: cleanCode, active } : {}),
      creditValue: parsedCredits,
      maxRedemptions: parsedMaximum,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    setIsSaving(true);
    try {
      await adminApi(coupon ? `/api/admin/coupons/${coupon.id}` : "/api/admin/coupons", {
        body: JSON.stringify(payload),
        method: coupon ? "PATCH" : "POST",
      });
      await onSaved(coupon ? `${coupon.code} was updated and audited.` : `${cleanCode} was created and audited.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The coupon could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="max-h-[calc(90dvh-8rem)] overflow-y-auto p-5 sm:p-7" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-semibold sm:col-span-2">
          Code
          <Input
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase"
            disabled={Boolean(coupon)}
            name="code"
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s+/g, "_"))}
            placeholder="RESEARCH_2026"
            required={!coupon}
            value={code}
          />
          <span className="block text-xs font-normal leading-5 text-ink-muted">
            {coupon ? "Codes are permanent once created so redemption history remains stable." : "Use uppercase letters, numbers, and underscores with no spaces."}
          </span>
        </label>

        <label className="block space-y-2 text-sm font-semibold">
          Credit value
          <Input
            className="font-mono"
            min="1"
            name="creditValue"
            onChange={(event) => setCreditValue(event.target.value)}
            required
            step="1"
            type="number"
            value={creditValue}
          />
        </label>

        <label className="block space-y-2 text-sm font-semibold">
          Maximum redemptions
          <Input
            className="font-mono"
            min={coupon ? Math.max(1, coupon.redemptionCount) : 1}
            name="maxRedemptions"
            onChange={(event) => setMaxRedemptions(event.target.value)}
            placeholder="Unlimited"
            step="1"
            type="number"
            value={maxRedemptions}
          />
        </label>

        <label className="block space-y-2 text-sm font-semibold sm:col-span-2">
          Expiry
          <Input
            className="font-mono"
            name="expiresAt"
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            value={expiresAt}
          />
          <span className="block text-xs font-normal leading-5 text-ink-muted">Leave blank for no expiry.</span>
        </label>

        {!coupon ? (
          <label className="flex items-start gap-3 border-y border-ink/15 py-3 text-sm">
            <input
              checked={active}
              className="mt-0.5 h-4 w-4 accent-[var(--accent-ochre)]"
              onChange={(event) => setActive(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-semibold">Active immediately</span>
              <span className="mt-1 block text-xs leading-5 text-ink-muted">The code can be redeemed as soon as it is created.</span>
            </span>
          </label>
        ) : null}
      </div>

      {error ? <InterfaceNotice className="mt-5" tone="error">{error}</InterfaceNotice> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-ink/15 pt-5">
        <Button disabled={isSaving} onClick={onCancel} type="button" variant="outline">Cancel</Button>
        <Button disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Ticket aria-hidden="true" />}
          {coupon ? "Save coupon" : "Create coupon"}
        </Button>
      </div>
    </form>
  );
}

export function AdminCouponsClient() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<AdminCoupon | null>(null);
  const [deactivatingCoupon, setDeactivatingCoupon] = useState<AdminCoupon | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);

  const loadCoupons = useCallback(async () => {
    const response = await adminApi<CouponsResponse>("/api/admin/coupons");
    setCoupons(response.coupons);
    setLoadError(null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;

    adminApi<CouponsResponse>("/api/admin/coupons")
      .then((response) => {
        if (active) setCoupons(response.coupons);
      })
      .catch((requestError: unknown) => {
        if (active) setLoadError(requestError instanceof Error ? requestError.message : "The coupon registry could not be loaded.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    setEditingCoupon(null);
    setEditorOpen(true);
    setStatusError(null);
  }

  function openEdit(coupon: AdminCoupon) {
    setEditingCoupon(coupon);
    setEditorOpen(true);
    setStatusError(null);
  }

  async function finishSave(message: string) {
    await loadCoupons();
    setEditorOpen(false);
    setEditingCoupon(null);
    setStatusSuccess(message);
    setStatusError(null);
  }

  async function setCouponActive(coupon: AdminCoupon, active: boolean) {
    setChangingId(coupon.id);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      await adminApi(`/api/admin/coupons/${coupon.id}`, {
        body: JSON.stringify({ active }),
        method: "PATCH",
      });
      await loadCoupons();
      setDeactivatingCoupon(null);
      setStatusSuccess(`${coupon.code} is now ${active ? "active" : "inactive"}; the change was audited.`);
    } catch (requestError) {
      setStatusError(requestError instanceof Error ? requestError.message : "The coupon status could not be changed.");
    } finally {
      setChangingId(null);
    }
  }

  return (
    <section className="mx-auto max-w-[96rem] px-5 py-8 sm:px-7 sm:py-10" aria-labelledby="coupon-registry-heading">
      <div className="flex flex-col gap-4 border-b border-ink/25 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="utility-label">Credit access codes</p>
          <h2 className="mt-1 text-2xl font-semibold" id="coupon-registry-heading">Coupon registry</h2>
          <p className="mt-1 text-sm text-ink-muted">{loaded ? `${formatAdminNumber(coupons.length)} codes recorded` : "Loading coupon records…"}</p>
        </div>
        <Button onClick={openCreate} type="button">
          <Plus aria-hidden="true" />
          Create coupon
        </Button>
      </div>

      {loadError ? <InterfaceNotice className="mt-5" tone="error">{loadError}</InterfaceNotice> : null}
      {statusError ? <InterfaceNotice className="mt-5" tone="error">{statusError}</InterfaceNotice> : null}
      {statusSuccess ? <InterfaceNotice className="mt-5" tone="success">{statusSuccess}</InterfaceNotice> : null}

      {!loaded && !loadError ? <div className="border-b border-ink/15 py-10 text-sm text-ink-muted" role="status">Loading the coupon registry…</div> : null}

      {loaded && !loadError ? (
        <div className="overflow-x-auto">
          <table className="min-w-[68rem] w-full border-collapse text-left text-xs">
            <thead className="bg-paper-deep/55 text-[0.62rem] uppercase tracking-[0.13em] text-ink-muted">
              <tr>
                <th className="px-3 py-3 font-semibold">Code</th>
                <th className="px-3 py-3 text-right font-semibold">Credits</th>
                <th className="px-3 py-3 text-right font-semibold">Redemptions</th>
                <th className="px-3 py-3 text-right font-semibold">Expiry</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Created</th>
                <th className="px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr className="border-b border-ink/15" key={coupon.id}>
                  <td className="px-3 py-4 font-mono font-semibold">{coupon.code}</td>
                  <td className="px-3 py-4 text-right font-mono font-semibold">{formatAdminNumber(coupon.creditValue)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-ink-muted">{couponCapacity(coupon)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[0.68rem] text-ink-muted">{coupon.expiresAt ? formatAdminDate(coupon.expiresAt, true) : "Never"}</td>
                  <td className="px-3 py-4">
                    <span className={coupon.active ? "text-pine" : "text-ink-muted"}>
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${coupon.active ? "bg-pine" : "bg-ink-muted"}`} aria-hidden="true" />
                      {coupon.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(coupon.createdAt)}</td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => openEdit(coupon)} size="sm" type="button" variant="text">
                        <Pencil aria-hidden="true" />Edit
                      </Button>
                      {coupon.active ? (
                        <Button disabled={changingId === coupon.id} onClick={() => setDeactivatingCoupon(coupon)} size="sm" type="button" variant="destructive">
                          <PowerOff aria-hidden="true" />Deactivate
                        </Button>
                      ) : (
                        <Button disabled={changingId === coupon.id} onClick={() => void setCouponActive(coupon, true)} size="sm" type="button" variant="outline">
                          {changingId === coupon.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Power aria-hidden="true" />}Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 ? (
                <tr className="border-b border-ink/15"><td className="px-3 py-10 text-center text-sm text-ink-muted" colSpan={7}>No coupons are recorded. Create the first code to begin.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
        <DialogContent aria-describedby="coupon-editor-description" className="max-w-2xl">
          <div className="border-b border-ink/15 px-5 py-5 pr-14 sm:px-7">
            <p className="utility-label">Audited coupon write</p>
            <DialogTitle className="mt-1">{editingCoupon ? `Edit ${editingCoupon.code}` : "Create coupon"}</DialogTitle>
            <DialogDescription className="mt-1" id="coupon-editor-description">
              {editingCoupon
                ? "Update value, capacity, or expiry without changing the permanent code."
                : "Create a reusable or capacity-limited credit code."}
            </DialogDescription>
          </div>
          {editorOpen ? (
            <CouponEditor
              coupon={editingCoupon}
              key={editingCoupon?.id ?? "new"}
              onCancel={() => setEditorOpen(false)}
              onSaved={finishSave}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setDeactivatingCoupon(null)} open={Boolean(deactivatingCoupon)}>
        <DialogContent aria-describedby="deactivate-coupon-description" className="max-w-lg">
          <div className="p-6 pr-14 sm:p-7 sm:pr-14">
            <p className="utility-label">Soft deactivation</p>
            <DialogTitle className="mt-1">Deactivate {deactivatingCoupon?.code}?</DialogTitle>
            <DialogDescription className="mt-2" id="deactivate-coupon-description">
              New redemptions will stop immediately. Existing redemption history and audit records will remain intact.
            </DialogDescription>
            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-ink/15 pt-5">
              <Button disabled={Boolean(changingId)} onClick={() => setDeactivatingCoupon(null)} type="button" variant="outline">Keep active</Button>
              <Button
                disabled={!deactivatingCoupon || Boolean(changingId)}
                onClick={() => deactivatingCoupon && void setCouponActive(deactivatingCoupon, false)}
                type="button"
                variant="destructive"
              >
                {changingId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PowerOff aria-hidden="true" />}
                Deactivate coupon
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
