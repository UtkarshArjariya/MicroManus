import { calculateUsageCost } from "@/lib/cost";
import type { ProviderId } from "@/lib/models";

export type StoredUsageCost = {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  total_cost_usd: number | string | null;
};

function numericValue(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

/** Matches the Stats page's legacy fallback for usage rows recorded before
 * stored cost columns were populated. */
export function resolveUsageTotalCostUsd(event: StoredUsageCost) {
  const storedTotal = numericValue(event.total_cost_usd);
  const tokenCount =
    event.input_tokens +
    event.output_tokens +
    event.cached_input_tokens +
    event.cache_write_tokens;

  if (storedTotal > 0 || tokenCount === 0) return storedTotal;

  const computed = calculateUsageCost({
    provider: event.provider as ProviderId,
    model: event.model,
    input_tokens: event.input_tokens,
    output_tokens: event.output_tokens,
    cached_input_tokens: event.cached_input_tokens,
    cache_write_tokens: event.cache_write_tokens,
  });

  return computed.pricing_available ? computed.total_cost_usd : storedTotal;
}
