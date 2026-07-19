"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LayoutDashboard, LogOut, Menu, ShieldCheck, Ticket, Users, X } from "lucide-react";

import { signOut } from "@/app/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import type { AdminIdentity } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

const adminNavigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
];

function initials(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return email.slice(0, 1).toUpperCase() || "A";
}

export function AdminShell({ children, user }: { children: React.ReactNode; user: AdminIdentity }) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => setNavigationOpen(false), [pathname]);

  function isActive(href: string) {
    return href === "/admin" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <main className="min-h-dvh bg-paper md:grid md:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 z-40 border-b border-ink/20 bg-paper-deep/95 backdrop-blur-sm md:flex md:h-dvh md:flex-col md:border-b-0 md:border-r md:bg-paper-deep/45 md:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3 p-4 md:p-5">
          <div>
            <Wordmark href="/admin" />
            <p className="ml-10 mt-1 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink-muted">
              Administration
            </p>
          </div>
          <Button
            aria-controls="admin-navigation"
            aria-expanded={navigationOpen}
            aria-label={navigationOpen ? "Close admin navigation" : "Open admin navigation"}
            className="md:hidden"
            onClick={() => setNavigationOpen((value) => !value)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {navigationOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 flex-col px-4 pb-4 md:flex md:px-5 md:pb-5",
            navigationOpen ? "flex" : "hidden",
          )}
          id="admin-navigation"
        >
          <div className="mb-3 flex items-center gap-2 border-l-2 border-pine px-3 py-2 text-xs text-ink-muted">
            <ShieldCheck className="h-4 w-4 text-pine" aria-hidden="true" />
            Restricted workspace
          </div>
          <nav aria-label="Admin" className="space-y-1">
            {adminNavigation.map(({ href, icon: Icon, label }) => (
              <Link
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 border-l-2 px-3 text-sm font-semibold transition-colors",
                  isActive(href)
                    ? "border-ochre bg-paper-surface text-ink"
                    : "border-transparent text-ink-muted hover:bg-paper-surface/70 hover:text-ink",
                )}
                href={href}
                key={href}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="my-4 border-t border-ink/15" />
          <Link
            className="flex h-10 items-center gap-2 border-l-2 border-transparent px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-paper-surface/70 hover:text-ink"
            href="/app"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Return to workspace
          </Link>

          <div className="mt-auto space-y-4 pt-8">
            <ThemeToggle />
            <div className="border-t border-ink/15 pt-4">
              <div className="flex items-center gap-3 px-1">
                <Avatar className="h-9 w-9 border border-ink/20">
                  {user.avatarUrl ? <AvatarImage alt="" src={user.avatarUrl} /> : null}
                  <AvatarFallback className="bg-paper-surface font-mono text-xs font-semibold text-ink">
                    {initials(user.name, user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-[0.68rem] text-ink-muted">{user.email}</p>
                </div>
              </div>
              <form action={signOut} className="mt-3">
                <Button className="w-full justify-start" type="submit" variant="ghost">
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </main>
  );
}
