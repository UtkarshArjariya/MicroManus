"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Coins, Loader2 } from "lucide-react";

import { adminApi, formatAdminDate, formatAdminMoney, formatAdminNumber } from "@/components/admin/admin-api";
import { InterfaceNotice } from "@/components/interface-notice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserDetailResponse } from "@/lib/admin/types";

function initials(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return email.slice(0, 1).toUpperCase() || "U";
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function providerLabel(value: string) {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    kimi: "Kimi",
    openai: "OpenAI",
    openai_compatible: "Custom endpoint",
  };
  return names[value] ?? value;
}

export function AdminUserDetailClient({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentSuccess, setAdjustmentSuccess] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const response = await adminApi<AdminUserDetailResponse>(`/api/admin/users/${encodeURIComponent(userId)}`);
    setDetail(response);
    setLoadError(null);
  }, [userId]);

  useEffect(() => {
    let active = true;

    adminApi<AdminUserDetailResponse>(`/api/admin/users/${encodeURIComponent(userId)}`)
      .then((response) => {
        if (active) setDetail(response);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setLoadError(requestError instanceof Error ? requestError.message : "The user ledger could not be loaded.");
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustmentError(null);
    setAdjustmentSuccess(null);

    const parsedAmount = Number(amount);
    const cleanReason = reason.trim();

    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      setAdjustmentError("Enter a whole, non-zero credit amount. Use a minus sign to remove credits.");
      return;
    }

    if (!cleanReason) {
      setAdjustmentError("Explain why this balance is being adjusted.");
      return;
    }

    setIsAdjusting(true);
    try {
      await adminApi(`/api/admin/users/${encodeURIComponent(userId)}/credits`, {
        body: JSON.stringify({ amount: parsedAmount, reason: cleanReason }),
        method: "POST",
      });
      await loadDetail();
      setAmount("");
      setReason("");
      setAdjustmentSuccess(`${parsedAmount > 0 ? "+" : ""}${parsedAmount} credits recorded with an audit entry.`);
    } catch (requestError) {
      setAdjustmentError(requestError instanceof Error ? requestError.message : "The credit adjustment could not be saved.");
    } finally {
      setIsAdjusting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[96rem] px-5 py-8 sm:px-7 sm:py-10">
      <Link className="inline-flex items-center gap-2 text-sm font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="/admin/users">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to users
      </Link>

      {loadError ? <InterfaceNotice className="mt-5" tone="error">{loadError}</InterfaceNotice> : null}
      {!detail && !loadError ? <div className="mt-5 border-y border-ink/20 py-10 text-sm text-ink-muted" role="status">Loading the user ledger…</div> : null}

      {detail ? (
        <>
          <section className="mt-6 grid gap-6 border-y border-ink/25 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-start">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14 border border-ink/20">
                {detail.user.avatarUrl ? <AvatarImage alt="" src={detail.user.avatarUrl} /> : null}
                <AvatarFallback className="bg-paper-deep font-mono text-sm font-semibold text-ink">
                  {initials(detail.user.name, detail.user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="utility-label">Account</p>
                <h2 className="mt-1 truncate text-3xl font-semibold">{detail.user.name}</h2>
                <p className="mt-1 break-all text-sm text-ink-muted">{detail.user.email}</p>
                <p className="mt-3 font-mono text-[0.68rem] text-ink-muted">User ID · {detail.user.id}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 border border-ink/15">
              <div className="border-b border-r border-ink/15 p-3">
                <dt className="utility-label">Balance</dt>
                <dd className="mt-1 font-mono text-xl font-semibold">{formatAdminNumber(detail.user.balance)}</dd>
              </div>
              <div className="border-b border-ink/15 p-3">
                <dt className="utility-label">Chats</dt>
                <dd className="mt-1 font-mono text-xl font-semibold">{formatAdminNumber(detail.user.totalChats)}</dd>
              </div>
              <div className="border-r border-ink/15 p-3">
                <dt className="utility-label">Tracked spend</dt>
                <dd className="mt-1 font-mono text-sm font-semibold">{formatAdminMoney(detail.user.totalSpentUsd)}</dd>
              </div>
              <div className="p-3">
                <dt className="utility-label">Last active</dt>
                <dd className="mt-1 font-mono text-[0.68rem] font-semibold">{formatAdminDate(detail.user.lastActiveDate)}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-10" aria-labelledby="adjustment-heading">
            <div className="border-b border-ink/25 pb-3">
              <p className="utility-label">Audited write</p>
              <h2 className="mt-1 text-2xl font-semibold" id="adjustment-heading">Manual credit adjustment</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                Positive amounts grant credits. Negative amounts remove them. A reason is required and retained in the admin audit log.
              </p>
            </div>
            <form className="grid gap-4 border-b border-ink/15 py-5 lg:grid-cols-[12rem_minmax(0,1fr)_auto] lg:items-end" onSubmit={submitAdjustment}>
              <label className="block space-y-2 text-sm font-semibold">
                Amount
                <Input
                  className="font-mono"
                  inputMode="numeric"
                  name="amount"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="+5 or -2"
                  required
                  step="1"
                  type="number"
                  value={amount}
                />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                Reason
                <textarea
                  className="flex min-h-20 w-full resize-y rounded-sm border border-ink/30 bg-paper-surface px-3 py-2 font-body text-sm font-normal text-ink transition-colors placeholder:text-ink-muted/75 hover:border-ink/50 focus-visible:border-ochre disabled:cursor-not-allowed disabled:opacity-50"
                  maxLength={500}
                  name="reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Required explanation for the audit trail"
                  required
                  value={reason}
                />
              </label>
              <Button className="lg:mb-0" disabled={isAdjusting} type="submit">
                {isAdjusting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Coins aria-hidden="true" />}
                Record adjustment
              </Button>
            </form>
            {adjustmentError ? <InterfaceNotice className="mt-4" tone="error">{adjustmentError}</InterfaceNotice> : null}
            {adjustmentSuccess ? <InterfaceNotice className="mt-4" tone="success">{adjustmentSuccess}</InterfaceNotice> : null}
          </section>

          <section className="mt-10" aria-labelledby="credit-ledger-heading">
            <div className="border-b border-ink/25 pb-3">
              <p className="utility-label">Every balance event</p>
              <h2 className="mt-1 text-2xl font-semibold" id="credit-ledger-heading">Credit ledger</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[46rem] w-full border-collapse text-left text-xs">
                <thead className="bg-paper-deep/55 text-[0.62rem] uppercase tracking-[0.13em] text-ink-muted">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 text-right font-semibold">Delta</th>
                    <th className="px-3 py-3 font-semibold">Reason</th>
                    <th className="px-3 py-3 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.ledger.map((row) => (
                    <tr className="border-b border-ink/15" key={row.id}>
                      <td className="whitespace-nowrap px-3 py-4 font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(row.createdAt, true)}</td>
                      <td className={`px-3 py-4 text-right font-mono font-semibold tabular-nums ${row.delta > 0 ? "text-pine" : "text-brick"}`}>
                        {row.delta > 0 ? "+" : ""}{formatAdminNumber(row.delta)}
                      </td>
                      <td className="px-3 py-4 font-semibold">{humanize(row.reason)}</td>
                      <td className="max-w-72 px-3 py-4 font-mono text-[0.68rem] text-ink-muted"><span className="block truncate" title={row.referenceId ?? undefined}>{row.referenceId ?? "—"}</span></td>
                    </tr>
                  ))}
                  {detail.ledger.length === 0 ? (
                    <tr className="border-b border-ink/15"><td className="px-3 py-8 text-center text-sm text-ink-muted" colSpan={4}>No credit events are recorded.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10" aria-labelledby="user-chats-heading">
            <div className="border-b border-ink/25 pb-3">
              <p className="utility-label">Conversation usage</p>
              <h2 className="mt-1 text-2xl font-semibold" id="user-chats-heading">Chats</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[48rem] w-full border-collapse text-left text-xs">
                <thead className="bg-paper-deep/55 text-[0.62rem] uppercase tracking-[0.13em] text-ink-muted">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Title</th>
                    <th className="px-3 py-3 font-semibold">Model</th>
                    <th className="px-3 py-3 text-right font-semibold">Cost</th>
                    <th className="px-3 py-3 text-right font-semibold">Opened</th>
                    <th className="px-3 py-3 text-right font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.chats.map((chat) => (
                    <tr className="border-b border-ink/15" key={chat.id}>
                      <td className="max-w-96 px-3 py-4"><span className="block truncate font-display text-sm font-semibold">{chat.title}</span></td>
                      <td className="max-w-72 px-3 py-4 font-mono text-[0.68rem] text-ink-muted"><span className="block truncate">{chat.model}</span></td>
                      <td className="px-3 py-4 text-right font-mono font-semibold">{formatAdminMoney(chat.totalCostUsd)}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(chat.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(chat.updatedAt)}</td>
                    </tr>
                  ))}
                  {detail.chats.length === 0 ? (
                    <tr className="border-b border-ink/15"><td className="px-3 py-8 text-center text-sm text-ink-muted" colSpan={5}>This account has no chats.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10" aria-labelledby="provider-metadata-heading">
            <div className="border-b border-ink/25 pb-3">
              <p className="utility-label">Safe metadata only</p>
              <h2 className="mt-1 text-2xl font-semibold" id="provider-metadata-heading">Connected providers</h2>
              <p className="mt-1 text-sm text-ink-muted">Only labels, masks, models, and dates are shown here.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[52rem] w-full border-collapse text-left text-xs">
                <thead className="bg-paper-deep/55 text-[0.62rem] uppercase tracking-[0.13em] text-ink-muted">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Provider</th>
                    <th className="px-3 py-3 font-semibold">Label</th>
                    <th className="px-3 py-3 font-semibold">Key mask</th>
                    <th className="px-3 py-3 font-semibold">Model</th>
                    <th className="px-3 py-3 text-right font-semibold">Added</th>
                    <th className="px-3 py-3 text-right font-semibold">Last successful test</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.providerKeys.map((key) => (
                    <tr className="border-b border-ink/15" key={key.id}>
                      <td className="px-3 py-4 font-semibold">{providerLabel(key.provider)}</td>
                      <td className="max-w-64 px-3 py-4"><span className="block truncate">{key.label}</span></td>
                      <td className="px-3 py-4 font-mono text-ink-muted">{key.maskedKey}</td>
                      <td className="max-w-72 px-3 py-4 font-mono text-[0.68rem] text-ink-muted"><span className="block truncate">{key.model}</span></td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(key.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[0.68rem] text-ink-muted">{key.lastTestedAt ? formatAdminDate(key.lastTestedAt, true) : "Not tracked"}</td>
                    </tr>
                  ))}
                  {detail.providerKeys.length === 0 ? (
                    <tr className="border-b border-ink/15"><td className="px-3 py-8 text-center text-sm text-ink-muted" colSpan={6}>No provider keys are connected.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
