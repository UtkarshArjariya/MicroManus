import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <section className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="flex items-center gap-3 border-l-2 border-ochre bg-paper-deep/50 px-4 py-3 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Opening your workspace…
      </div>
    </section>
  );
}
