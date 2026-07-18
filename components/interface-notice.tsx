import { cn } from "@/lib/utils";

export function InterfaceNotice({
  children,
  tone = "info",
  className,
}: {
  children: React.ReactNode;
  tone?: "error" | "success" | "info";
  className?: string;
}) {
  return (
    <p className={cn("case-notice", className)} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
