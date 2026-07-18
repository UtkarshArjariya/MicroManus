import { Loader2 } from "lucide-react";

export default function PaywallLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading checkout options...
      </div>
    </main>
  );
}
