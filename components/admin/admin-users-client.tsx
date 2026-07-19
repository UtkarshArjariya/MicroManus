"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search } from "lucide-react";

import { adminApi, formatAdminDate, formatAdminMoney, formatAdminNumber } from "@/components/admin/admin-api";
import { InterfaceNotice } from "@/components/interface-notice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import type { AdminUserSummary } from "@/lib/admin/types";

type UsersResponse = { users: AdminUserSummary[] };
type SortKey = "name" | "email" | "signupDate" | "balance" | "totalChats" | "totalSpentUsd" | "lastActiveDate";
type SortDirection = "asc" | "desc";

const sortLabels: Record<SortKey, string> = {
  name: "Name",
  email: "Email",
  signupDate: "Signup",
  balance: "Balance",
  totalChats: "Chats",
  totalSpentUsd: "Spend",
  lastActiveDate: "Last active",
};

function initials(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return email.slice(0, 1).toUpperCase() || "U";
}

function comparable(user: AdminUserSummary, key: SortKey) {
  if (key === "name" || key === "email") return user[key].toLocaleLowerCase();
  if (key === "signupDate") return new Date(user.signupDate).getTime();
  if (key === "lastActiveDate") return user.lastActiveDate ? new Date(user.lastActiveDate).getTime() : 0;
  return user[key];
}

function SortableHeading({
  align = "left",
  activeKey,
  direction,
  onSort,
  sortKey,
}: {
  align?: "left" | "right";
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  sortKey: SortKey;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        className={`inline-flex items-center gap-1.5 transition-colors hover:text-ink ${align === "right" ? "ml-auto" : ""}`}
        onClick={() => onSort(sortKey)}
        type="button"
      >
        {sortLabels[sortKey]}
        <Icon className="h-3 w-3" aria-hidden="true" />
      </button>
    </th>
  );
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastActiveDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    const controller = new AbortController();

    adminApi<UsersResponse>("/api/admin/users", { signal: controller.signal })
      .then((response) => setUsers(response.users))
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The user registry could not be loaded.");
      })
      .finally(() => setLoaded(true));

    return () => controller.abort();
  }, []);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = normalizedQuery
      ? users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase().includes(normalizedQuery))
      : users;

    return [...filtered].sort((left, right) => {
      const leftValue = comparable(left, sortKey);
      const rightValue = comparable(right, sortKey);
      const result = typeof leftValue === "string"
        ? leftValue.localeCompare(String(rightValue))
        : Number(leftValue) - Number(rightValue);
      return sortDirection === "asc" ? result : -result;
    });
  }, [query, sortDirection, sortKey, users]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(key);
    setSortDirection(key === "name" || key === "email" ? "asc" : "desc");
  }

  return (
    <section className="mx-auto max-w-[96rem] px-5 py-8 sm:px-7 sm:py-10" aria-labelledby="user-registry-heading">
      <div className="flex flex-col gap-4 border-b border-ink/25 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="utility-label">All accounts</p>
          <h2 className="mt-1 text-2xl font-semibold" id="user-registry-heading">User registry</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {loaded ? `${formatAdminNumber(visibleUsers.length)} of ${formatAdminNumber(users.length)} users` : "Loading account records…"}
          </p>
        </div>
        <label className="relative block w-full md:max-w-sm">
          <span className="sr-only">Search by name or email</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email"
            type="search"
            value={query}
          />
        </label>
      </div>

      {error ? <InterfaceNotice className="mt-5" tone="error">{error}</InterfaceNotice> : null}

      {!loaded && !error ? (
        <div className="border-b border-ink/15 py-10 text-sm text-ink-muted" role="status">Loading the user registry…</div>
      ) : null}

      {loaded && !error ? (
        <div className="overflow-x-auto">
          <table className="min-w-[76rem] w-full border-collapse text-left text-xs">
            <thead className="bg-paper-deep/55 text-[0.62rem] uppercase tracking-[0.13em] text-ink-muted">
              <tr>
                <th className="w-16 px-3 py-3 font-semibold"><span className="sr-only">Avatar</span></th>
                <SortableHeading activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="name" />
                <SortableHeading activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="email" />
                <SortableHeading activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="signupDate" />
                <SortableHeading align="right" activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="balance" />
                <SortableHeading align="right" activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="totalChats" />
                <SortableHeading align="right" activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="totalSpentUsd" />
                <th className="px-3 py-3 font-semibold">Providers</th>
                <SortableHeading align="right" activeKey={sortKey} direction={sortDirection} onSort={handleSort} sortKey="lastActiveDate" />
                <th className="w-10 px-3 py-3"><span className="sr-only">Open user</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr className="border-b border-ink/15 transition-colors hover:bg-paper-surface/55" key={user.id}>
                  <td className="px-3 py-3">
                    <Avatar className="h-8 w-8 border border-ink/20">
                      {user.avatarUrl ? <AvatarImage alt="" src={user.avatarUrl} /> : null}
                      <AvatarFallback className="bg-paper-deep font-mono text-[0.62rem] font-semibold text-ink">
                        {initials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>
                  </td>
                  <td className="max-w-52 px-3 py-3">
                    <Link className="block truncate font-display text-sm font-semibold underline-offset-4 hover:text-ochre hover:underline" href={`/admin/users/${user.id}`}>
                      {user.name}
                    </Link>
                  </td>
                  <td className="max-w-64 px-3 py-3"><span className="block truncate">{user.email}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(user.signupDate)}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">{formatAdminNumber(user.balance)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatAdminNumber(user.totalChats)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatAdminMoney(user.totalSpentUsd)}</td>
                  <td className="max-w-56 px-3 py-3"><span className="block truncate text-ink-muted">{user.providers.join(", ") || "None"}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-[0.68rem] text-ink-muted">{formatAdminDate(user.lastActiveDate)}</td>
                  <td className="px-3 py-3 text-right">
                    <Link aria-label={`Open ${user.name}`} className="inline-grid h-8 w-8 place-items-center text-ink-muted hover:text-ochre" href={`/admin/users/${user.id}`}>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
              {visibleUsers.length === 0 ? (
                <tr className="border-b border-ink/15">
                  <td className="px-3 py-10 text-center text-sm text-ink-muted" colSpan={10}>
                    {query ? "No users match that name or email." : "No user accounts are recorded yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
