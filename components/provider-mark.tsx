import type { ProviderId } from "@/lib/models";
import { cn } from "@/lib/utils";

const PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  kimi: "Kimi",
  openai_compatible: "Custom endpoint",
};

const PROVIDER_COLORS: Record<ProviderId, string> = {
  openai: "bg-ochre",
  anthropic: "bg-brick",
  google: "bg-ochre",
  kimi: "bg-pine",
  openai_compatible: "bg-ink-muted",
};

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDER_NAMES;
}

export function providerName(provider: ProviderId) {
  return PROVIDER_NAMES[provider];
}

export function ProviderMark({
  provider,
  showLabel = true,
  className,
}: {
  provider: ProviderId;
  showLabel?: boolean;
  className?: string;
}) {
  const name = providerName(provider);

  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={name}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", PROVIDER_COLORS[provider])} />
      {showLabel ? <span>{name}</span> : <span className="sr-only">{name}</span>}
    </span>
  );
}
