import { Loader2 } from "lucide-react";

export default function StatsLoading() {
  return (
    <main className="min-h-screen bg-paper px-5 py-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3 border-l-2 border-ochre bg-paper-deep/50 px-4 py-3 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Opening the usage ledger…
      </div>
    </main>
  );
}
