import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <main className="grid min-h-screen bg-stone-50 md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="hidden border-r bg-background p-4 md:block">
        <div className="h-10 w-36 rounded-md bg-muted" />
        <div className="mt-6 space-y-2">
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 rounded-md bg-muted" />
        </div>
      </aside>
      <section className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading workspace...
        </div>
      </section>
    </main>
  );
}
