import { cn } from "@/lib/utils";

export function CreditStamp({ balance, className }: { balance: number; className?: string }) {
  const low = balance <= 1;

  return (
    <div
      aria-label={`${balance} ${balance === 1 ? "credit" : "credits"} remaining`}
      className={cn("credit-stamp", className)}
      data-low={low}
      role="img"
    >
      <span className="credit-stamp__value">{balance}</span>
      <span className="credit-stamp__label">CREDITS</span>
    </div>
  );
}
