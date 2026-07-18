import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <main className="grid min-h-screen bg-paper md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-ink/20 bg-paper-deep/50 p-5 md:block">
        <div className="h-8 w-36 bg-paper-surface" />
        <div className="mt-6 space-y-2">
          <div className="h-10 bg-paper-surface" />
          <div className="h-10 bg-paper-surface" />
          <div className="h-10 bg-paper-surface" />
        </div>
      </aside>
      <section className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 border-l-2 border-ochre bg-paper-deep/50 px-4 py-3 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Opening the research desk…
        </div>
      </section>
    </main>
  );
}
