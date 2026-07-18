"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

type ThemeChoice = {
  icon: LucideIcon;
  label: string;
  value: "light" | "dark" | "system";
};

const themeChoices: ThemeChoice[] = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
  { icon: Monitor, label: "System", value: "system" },
];

function subscribeToHydration() {
  return () => undefined;
}

export function ThemeToggle({
  className,
  showLabels = false,
}: {
  className?: string;
  showLabels?: boolean;
}) {
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  return (
    <div
      aria-label="Color theme"
      className={cn(
        "grid grid-cols-3 gap-1 border border-ink/15 bg-paper p-1",
        showLabels && "w-full",
        className,
      )}
      role="group"
    >
      {themeChoices.map(({ icon: Icon, label, value }) => {
        const selected = mounted && theme === value;

        return (
          <button
            aria-label={`Use ${label.toLowerCase()} theme`}
            aria-pressed={selected}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-2 border border-transparent px-2 font-body text-xs font-medium text-ink-muted transition-[background-color,border-color,color] hover:border-ink/20 hover:bg-paper-deep/70 hover:text-ink focus-visible:outline-none",
              selected && "border-ochre/60 bg-ochre/15 text-ink",
            )}
            key={value}
            onClick={() => setTheme(value)}
            title={`${label} theme`}
            type="button"
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {showLabels ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
