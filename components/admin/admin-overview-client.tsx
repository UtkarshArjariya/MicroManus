"use client";

import { useEffect, useState } from "react";

import { adminApi, formatAdminMoney, formatAdminNumber } from "@/components/admin/admin-api";
import { InterfaceNotice } from "@/components/interface-notice";
import type { AdminOverview } from "@/lib/admin/types";

type OverviewResponse = { overview: AdminOverview };

function formatRevenue(overview: AdminOverview) {
  if (overview.stripeRevenue.length === 0) return "No paid revenue";

  return overview.stripeRevenue
    .map((entry) => formatAdminMoney(entry.amountMinor / 100, entry.currency))
    .join(" · ");
}

export function AdminOverviewClient() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    adminApi<OverviewResponse>("/api/admin/overview", { signal: controller.signal })
      .then((response) => setOverview(response.overview))
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The overview could not be loaded.");
      });

    return () => controller.abort();
  }, []);

  const rows = overview ? [
    { label: "Total users", note: "Registered MicroManus accounts", value: formatAdminNumber(overview.totalUsers) },
    { label: "Total credits issued", note: "All positive credit-ledger entries", value: formatAdminNumber(overview.totalCreditsIssued) },
    { label: "Coupon credits", note: "Credits issued through coupon redemption", value: formatAdminNumber(overview.couponCreditsIssued) },
    { label: "Stripe credits", note: "Credits issued after verified checkout", value: formatAdminNumber(overview.stripeCreditsIssued) },
    { label: "Stripe revenue", note: "Collected payment totals, kept in their recorded currencies", value: formatRevenue(overview) },
    { label: "Total chats", note: "Research threads created across all accounts", value: formatAdminNumber(overview.totalChats) },
    { label: "Total messages", note: "Stored messages across every thread", value: formatAdminNumber(overview.totalMessages) },
    { label: "Tracked LLM cost", note: "Recorded provider cost across usage events", value: formatAdminMoney(overview.totalLlmCostUsd) },
    { label: "Active coupons", note: "Codes currently marked active", value: formatAdminNumber(overview.activeCoupons) },
  ] : [];

  return (
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-7 sm:py-10" aria-labelledby="overview-ledger-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="utility-label">System totals</p>
          <h2 className="mt-1 text-2xl font-semibold" id="overview-ledger-heading">Operating ledger</h2>
        </div>
        <p className="hidden font-mono text-[0.68rem] text-ink-muted sm:block">Live database totals</p>
      </div>

      {error ? <InterfaceNotice tone="error">{error}</InterfaceNotice> : null}

      {!overview && !error ? (
        <div className="border-y border-ink/20 py-10 text-sm text-ink-muted" role="status">
          Loading the operating ledger…
        </div>
      ) : null}

      {overview ? (
        <dl className="divide-y divide-ink/15 border-y border-ink/25">
          {rows.map((row) => (
            <div className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8" key={row.label}>
              <div>
                <dt className="font-semibold text-ink">{row.label}</dt>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{row.note}</p>
              </div>
              <dd className="font-mono text-xl font-semibold tabular-nums sm:text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
