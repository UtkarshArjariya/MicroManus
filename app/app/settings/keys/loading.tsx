import { Loader2 } from "lucide-react";

export default function KeySettingsLoading() {
  return (
    <main className="min-h-screen bg-stone-50 px-5 py-6">
      <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading key settings...
      </div>
    </main>
  );
}
