import "server-only";

import { MODEL_PRICING, type ProviderId } from "@/lib/models";

export type UsageCostInput = {
  provider: ProviderId;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens?: number;
};

export type UsageCost = {
  input_cost_usd: number;
  output_cost_usd: number;
  cached_cost_usd: number;
  cache_write_cost_usd: number;
  total_cost_usd: number;
};

function roundUsd(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function findModelPricing(provider: ProviderId, model: string) {
  return (
    MODEL_PRICING.find((item) => item.provider === provider && item.modelId === model) ??
    MODEL_PRICING.find((item) => item.modelId === model) ??
    null
  );
}

export function calculateUsageCost(row: UsageCostInput): UsageCost {
  const pricing = findModelPricing(row.provider, row.model);
  if (!pricing) {
    return {
      input_cost_usd: 0,
      output_cost_usd: 0,
      cached_cost_usd: 0,
      cache_write_cost_usd: 0,
      total_cost_usd: 0,
    };
  }

  const cachedTokens = Math.min(row.cached_input_tokens, row.input_tokens);
  const cacheWriteTokens = Math.min(
    row.cache_write_tokens ?? 0,
    Math.max(row.input_tokens - cachedTokens, 0),
  );
  const uncachedInputTokens = Math.max(row.input_tokens - cachedTokens - cacheWriteTokens, 0);
  const cachedInputPricePerM = pricing.cachedInputPricePerM ?? pricing.inputPricePerM;
  const cacheWritePricePerM = pricing.cacheWritePricePerM ?? pricing.inputPricePerM;
  const inputCost = (uncachedInputTokens / 1_000_000) * pricing.inputPricePerM;
  const outputCost = (row.output_tokens / 1_000_000) * pricing.outputPricePerM;
  const cachedCost = (cachedTokens / 1_000_000) * cachedInputPricePerM;
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * cacheWritePricePerM;
  const totalCost = inputCost + outputCost + cachedCost + cacheWriteCost;

  return {
    input_cost_usd: roundUsd(inputCost),
    output_cost_usd: roundUsd(outputCost),
    cached_cost_usd: roundUsd(cachedCost),
    cache_write_cost_usd: roundUsd(cacheWriteCost),
    total_cost_usd: roundUsd(totalCost),
  };
}
