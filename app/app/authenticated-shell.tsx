"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronUp,
  CreditCard,
  KeyRound,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Plus,
  Settings,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";

import { signOut } from "@/app/app/actions";
import { KeysClient } from "@/app/app/settings/keys/keys-client";
import { PaywallClient } from "@/app/paywall/paywall-client";
import { CreditStamp } from "@/components/credit-stamp";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "@/components/wordmark";
import type { ProviderApiFormat, ProviderId } from "@/lib/models";
import { cn } from "@/lib/utils";

export type WorkspaceProviderKey = {
  id: string;
  provider: ProviderId;
  api_format: ProviderApiFormat;
  label: string;
  base_url: string | null;
  key_last4: string;
  default_model: string;
  created_at: string;
};

export type WorkspaceChat = {
  id: string;
  title: string;
  model: string;
  provider_key_id: string | null;
  updated_at: string;
  has_report: boolean;
};

export type WorkspaceUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
};

type SettingsTab = "profile" | "appearance" | "api-keys" | "billing";

type WorkspaceContextValue = {
  balance: number;
  chats: WorkspaceChat[];
  keys: WorkspaceProviderKey[];
  openSettings: (tab?: SettingsTab) => void;
  setBalance: (balance: number) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside the authenticated app shell.");
  }
  return value;
}

function initials(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return email.slice(0, 1).toUpperCase() || "M";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

const settingsTabs: Array<{ id: SettingsTab; label: string; icon: typeof UserRound }> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "billing", label: "Billing", icon: CreditCard },
];

function AccountControl({
  balance,
  compact = false,
  onOpenSettings,
  user,
}: {
  balance: number;
  compact?: boolean;
  onOpenSettings: (tab?: SettingsTab) => void;
  user: WorkspaceUser;
}) {
  const fallback = initials(user.name, user.email);
  const { setTheme, theme } = useTheme();
  const quickThemes = [
    { icon: Sun, label: "Light", value: "light" },
    { icon: Moon, label: "Dark", value: "dark" },
    { icon: Monitor, label: "System", value: "system" },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Open account menu for ${user.name}`}
          className={cn(
            "flex items-center border border-ink/20 bg-paper-surface text-left transition-colors hover:border-ink/45 hover:bg-paper-deep/70",
            compact ? "h-10 w-10 justify-center rounded-full" : "w-full gap-3 px-3 py-2.5",
          )}
          type="button"
        >
          <Avatar className="h-8 w-8 border border-ink/20">
            {user.avatarUrl ? <AvatarImage alt="" src={user.avatarUrl} /> : null}
            <AvatarFallback className="bg-paper-deep font-mono text-xs font-semibold text-ink">{fallback}</AvatarFallback>
          </Avatar>
          {!compact ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{user.name}</span>
                <span className="block truncate text-[0.68rem] text-ink-muted">{balance} credits</span>
              </span>
              <ChevronUp className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"}>
        <DropdownMenuLabel>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
            <CreditStamp balance={balance} className="scale-[0.68]" />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="pb-1 pt-2">
          <span className="utility-label">Quick theme</span>
        </DropdownMenuLabel>
        {quickThemes.map(({ icon: Icon, label, value }) => (
          <DropdownMenuItem
            aria-label={`Use ${label.toLowerCase()} theme`}
            key={value}
            onSelect={(event) => {
              event.preventDefault();
              setTheme(value);
            }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {theme === value ? <Check className="h-4 w-4 text-pine" aria-label="Selected" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpenSettings("profile")}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Open settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild className="text-brick focus:bg-brick/10 focus:text-brick">
            <button className="w-full" type="submit">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsDialog({
  balance,
  initialTab,
  keys,
  onOpenChange,
  open,
  paymentCancelled,
  paymentSuccess,
  returnTo,
  user,
}: {
  balance: number;
  initialTab: SettingsTab;
  keys: WorkspaceProviderKey[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  paymentCancelled: boolean;
  paymentSuccess: boolean;
  returnTo: string;
  user: WorkspaceUser;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [initialTab, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby="settings-description">
        <div className="border-b border-ink/15 px-5 py-5 pr-14 sm:px-7">
          <p className="utility-label">Account workspace</p>
          <DialogTitle className="mt-1">Settings</DialogTitle>
          <DialogDescription id="settings-description" className="mt-1">
            Manage your profile, display, model access, and billing without leaving this page.
          </DialogDescription>
        </div>

        <div className="grid max-h-[calc(90dvh-7.75rem)] min-h-[28rem] overflow-hidden md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            aria-label="Settings sections"
            className="flex gap-1 overflow-x-auto border-b border-ink/15 bg-paper-deep/35 p-3 md:flex-col md:border-b-0 md:border-r md:p-4"
          >
            {settingsTabs.map(({ id, label, icon: Icon }) => (
              <button
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "flex min-w-max items-center gap-2 border-l-2 px-3 py-2.5 text-left text-sm font-semibold text-ink-muted transition-colors hover:bg-paper-surface hover:text-ink md:w-full",
                  tab === id && "border-ochre bg-paper-surface text-ink",
                  tab !== id && "border-transparent",
                )}
                id={`settings-tab-${id}`}
                key={id}
                onClick={() => setTab(id)}
                type="button"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          <div className="overflow-y-auto p-5 sm:p-7">
            {tab === "profile" ? (
              <section aria-labelledby="settings-tab-profile" id="settings-panel-profile">
                <p className="utility-label">OAuth profile</p>
                <h2 className="mt-2 text-2xl font-semibold">Your account</h2>
                <div className="mt-6 flex items-center gap-4 border-y border-ink/15 py-5">
                  <Avatar className="h-14 w-14 border border-ink/20">
                    {user.avatarUrl ? <AvatarImage alt="" src={user.avatarUrl} /> : null}
                    <AvatarFallback className="bg-paper-deep font-mono text-sm font-semibold text-ink">
                      {initials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{user.name}</p>
                    <p className="truncate text-sm text-ink-muted">{user.email}</p>
                    <p className="mt-1 text-xs text-ink-muted">Profile details come from your sign-in provider.</p>
                  </div>
                </div>
                <form action={signOut} className="mt-6">
                  <Button type="submit" variant="destructive">
                    <LogOut aria-hidden="true" />
                    Sign out of MicroManus
                  </Button>
                </form>
              </section>
            ) : null}

            {tab === "appearance" ? (
              <section aria-labelledby="settings-tab-appearance" id="settings-panel-appearance">
                <p className="utility-label">Display preference</p>
                <h2 className="mt-2 text-2xl font-semibold">Appearance</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">
                  Use a light or dark research desk, or follow this device&apos;s current setting.
                </p>
                <ThemeToggle className="mt-6 max-w-lg" showLabels />
              </section>
            ) : null}

            {tab === "api-keys" ? (
              <section aria-labelledby="settings-tab-api-keys" id="settings-panel-api-keys">
                <p className="utility-label">Bring your own model</p>
                <h2 className="mt-2 text-2xl font-semibold">API Keys</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  Add, test, edit, or remove encrypted provider credentials. Secret values are never shown again.
                </p>
                <div className="mt-6">
                  <KeysClient keys={keys} />
                </div>
              </section>
            ) : null}

            {tab === "billing" ? (
              <section aria-labelledby="settings-tab-billing" id="settings-panel-billing">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="utility-label">Credits and payments</p>
                    <h2 className="mt-2 text-2xl font-semibold">Billing</h2>
                    <p className="mt-2 text-sm leading-6 text-ink-muted">
                      Add five credits with the launch coupon or secure card checkout.
                    </p>
                  </div>
                  <CreditStamp balance={balance} />
                </div>
                <div className="mt-6">
                  <PaywallClient
                    embedded
                    paymentCancelled={paymentCancelled}
                    paymentSuccess={paymentSuccess}
                    returnTo={returnTo}
                  />
                </div>
                <Button
                  className="mt-5"
                  onClick={() => {
                    onOpenChange(false);
                    router.push("/app/stats");
                  }}
                  type="button"
                  variant="outline"
                >
                  <BarChart3 aria-hidden="true" />
                  View detailed usage and costs
                </Button>
              </section>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuthenticatedShell({
  balance: initialBalance,
  children,
  chats,
  keys,
  user,
}: {
  balance: number;
  children: React.ReactNode;
  chats: WorkspaceChat[];
  keys: WorkspaceProviderKey[];
  user: WorkspaceUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [balance, setBalance] = useState(initialBalance);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentCancelled, setPaymentCancelled] = useState(false);

  useEffect(() => setBalance(initialBalance), [initialBalance]);
  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const requestedTab = params.get("settings");
    if (settingsTabs.some((item) => item.id === requestedTab)) {
      setSettingsTab(requestedTab as SettingsTab);
      setSettingsOpen(true);
    }
    setPaymentSuccess(params.get("stripe") === "success");
    setPaymentCancelled(params.get("stripe") === "cancelled");
  }, [searchParamsString]);

  const billingReturnTo = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    params.delete("stripe");
    params.delete("stripe_session_id");
    params.set("settings", "billing");
    return `${pathname}?${params.toString()}`;
  }, [pathname, searchParamsString]);

  const openSettings = useCallback((tab: SettingsTab = "profile") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const handleSettingsOpenChange = useCallback((open: boolean) => {
    setSettingsOpen(open);
    if (!open) {
      setPaymentSuccess(false);
      setPaymentCancelled(false);
      const params = new URLSearchParams(searchParamsString);
      if (params.has("settings") || params.has("stripe") || params.has("stripe_session_id")) {
        params.delete("settings");
        params.delete("stripe");
        params.delete("stripe_session_id");
        const query = params.toString();
        router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
      }
    }
  }, [pathname, router, searchParamsString]);

  const contextValue = useMemo<WorkspaceContextValue>(() => ({
    balance,
    chats,
    keys,
    openSettings,
    setBalance,
  }), [balance, chats, keys, openSettings]);

  const activeChatId = pathname.startsWith("/app/") && !pathname.startsWith("/app/stats") && pathname !== "/app/new"
    ? pathname.slice("/app/".length).split("/")[0]
    : null;

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <main className="min-h-dvh bg-paper md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 z-40 border-b border-ink/20 bg-paper-deep/95 backdrop-blur-sm md:flex md:h-dvh md:flex-col md:border-b-0 md:border-r md:bg-paper-deep/45 md:backdrop-blur-none">
          <div className="flex items-center justify-between gap-3 p-4 md:p-5">
            <Wordmark href="/app" />
            <div className="flex items-center gap-2 md:hidden">
              <AccountControl balance={balance} compact onOpenSettings={openSettings} user={user} />
              <Button
                aria-controls="workspace-navigation"
                aria-expanded={navOpen}
                aria-label={navOpen ? "Close workspace navigation" : "Open workspace navigation"}
                onClick={() => setNavOpen((value) => !value)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {navOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 flex-col px-4 pb-4 md:flex md:px-5 md:pb-5",
              navOpen ? "flex" : "hidden",
            )}
            id="workspace-navigation"
          >
            {balance <= 1 ? (
              <button
                className="mb-4 border-l-2 border-brick pl-3 text-left text-xs leading-5 text-brick"
                onClick={() => openSettings("billing")}
                type="button"
              >
                {balance <= 0 ? "No credits remain." : "One credit remains."}{" "}
                <span className="font-semibold underline underline-offset-4">Open billing</span>
              </button>
            ) : null}

            <nav aria-label="Workspace" className="space-y-1">
              <Link
                aria-current={pathname === "/app/new" ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 border-l-2 px-3 text-sm font-semibold transition-colors",
                  pathname === "/app/new"
                    ? "border-ochre bg-paper-surface text-ink"
                    : "border-transparent text-ink-muted hover:bg-paper-surface/70 hover:text-ink",
                )}
                href="/app/new"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New chat
              </Link>
              <Link
                aria-current={pathname === "/app/stats" ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 border-l-2 px-3 text-sm font-semibold transition-colors",
                  pathname === "/app/stats"
                    ? "border-ochre bg-paper-surface text-ink"
                    : "border-transparent text-ink-muted hover:bg-paper-surface/70 hover:text-ink",
                )}
                href="/app/stats"
              >
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Stats and costs
              </Link>
            </nav>

            <div className="my-4 border-t border-ink/15" />
            <div className="mb-2 flex items-center justify-between">
              <p className="utility-label">Chats</p>
              <span className="font-mono text-[0.65rem] text-ink-muted">{chats.length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {chats.length === 0 ? (
                <p className="border-l-2 border-ink/20 py-2 pl-3 text-xs leading-5 text-ink-muted">
                  No chats yet. Choose <span className="font-semibold text-ink">New chat</span> to begin.
                </p>
              ) : chats.map((chat) => (
                <Link
                  aria-current={chat.id === activeChatId ? "page" : undefined}
                  className={cn(
                    "group relative block border-l-2 px-3 py-2.5 transition-colors",
                    chat.id === activeChatId
                      ? "border-ochre bg-paper-surface"
                      : "border-ink/20 hover:border-ink-muted hover:bg-paper-surface/60",
                  )}
                  href={`/app/${chat.id}`}
                  key={chat.id}
                >
                  <span className="flex items-start gap-2">
                    {chat.has_report ? (
                      <span
                        aria-label="Completed report attached"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pine"
                        title="Completed report attached"
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate font-display text-sm font-semibold">{chat.title}</span>
                      <span className="mt-1 block truncate font-mono text-[0.62rem] text-ink-muted">
                        {chat.model} · {formatDate(chat.updated_at)}
                      </span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-4 hidden border-t border-ink/15 pt-4 md:block">
              <AccountControl balance={balance} onOpenSettings={openSettings} user={user} />
            </div>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </main>

      <SettingsDialog
        balance={balance}
        initialTab={settingsTab}
        keys={keys}
        onOpenChange={handleSettingsOpenChange}
        open={settingsOpen}
        paymentCancelled={paymentCancelled}
        paymentSuccess={paymentSuccess}
        returnTo={billingReturnTo}
        user={user}
      />
    </WorkspaceContext.Provider>
  );
}
