import Link from "next/link";

import { cn } from "@/lib/utils";

export function Wordmark({ href, className }: { href?: string; className?: string }) {
  const content = (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span aria-hidden="true" className="relative h-7 w-7 rounded-full border border-ochre">
        <span className="absolute inset-[4px] rounded-full border border-dashed border-ochre" />
        <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-ink" />
      </span>
      <span className="font-display text-xl font-semibold tracking-[-0.02em]">MicroManus</span>
    </span>
  );

  return href ? (
    <Link aria-label="MicroManus home" href={href}>
      {content}
    </Link>
  ) : content;
}
