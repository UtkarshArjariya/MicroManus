export type ProviderId = "openai" | "anthropic" | "kimi" | "openai_compatible";

export type ModelPricing = {
  provider: ProviderId;
  modelId: string;
  label: string;
  inputPricePerM: number;
  outputPricePerM: number;
  cachedInputPricePerM: number | null;
  supportsPromptCaching: boolean;
  note?: string;
};

// Pricing changes frequently. Keep this file as the single source of truth for
// prompt-4 cost math and update it whenever providers change public pricing.
export const MODEL_PRICING: ModelPricing[] = [
  {
    provider: "openai",
    modelId: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    inputPricePerM: 2.5,
    outputPricePerM: 15,
    cachedInputPricePerM: 0.25,
    supportsPromptCaching: true,
  },
  {
    provider: "openai",
    modelId: "gpt-5.5",
    label: "GPT-5.5",
    inputPricePerM: 5,
    outputPricePerM: 30,
    cachedInputPricePerM: 0.5,
    supportsPromptCaching: true,
  },
  {
    provider: "openai",
    modelId: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    inputPricePerM: 0.75,
    outputPricePerM: 4.5,
    cachedInputPricePerM: 0.075,
    supportsPromptCaching: true,
    note: "Cached input entered as roughly 10% of input pricing per prompt spec.",
  },
  {
    provider: "openai",
    modelId: "gpt-4.1",
    label: "GPT-4.1 (legacy fallback)",
    inputPricePerM: 2,
    outputPricePerM: 8,
    cachedInputPricePerM: null,
    supportsPromptCaching: false,
    note: "Approximate fallback/legacy price. Verify current price before production cost display.",
  },
  {
    provider: "anthropic",
    modelId: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    inputPricePerM: 15,
    outputPricePerM: 75,
    cachedInputPricePerM: 1.5,
    supportsPromptCaching: true,
    note: "Verify exact model availability. Current public Opus-family API pricing checked against Anthropic docs.",
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    inputPricePerM: 3,
    outputPricePerM: 15,
    cachedInputPricePerM: 0.3,
    supportsPromptCaching: true,
    note: "Verify exact model availability. Current public Sonnet-family API pricing checked against Anthropic docs.",
  },
  {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    inputPricePerM: 0.8,
    outputPricePerM: 4,
    cachedInputPricePerM: 0.08,
    supportsPromptCaching: true,
    note: "Verify exact model availability. Current public Haiku-family API pricing checked against Anthropic docs.",
  },
  {
    provider: "kimi",
    modelId: "kimi-k2.6",
    label: "Kimi K2.6",
    inputPricePerM: 0.95,
    outputPricePerM: 4,
    cachedInputPricePerM: null,
    supportsPromptCaching: false,
  },
  {
    provider: "kimi",
    modelId: "kimi-k2.5",
    label: "Kimi K2.5",
    inputPricePerM: 0.6,
    outputPricePerM: 3,
    cachedInputPricePerM: null,
    supportsPromptCaching: false,
  },
  {
    provider: "kimi",
    modelId: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    inputPricePerM: 0.96,
    outputPricePerM: 3.97,
    cachedInputPricePerM: null,
    supportsPromptCaching: false,
    note: "Approximate coding-focused price from prompt spec.",
  },
];

export function getModelsForProvider(provider: ProviderId) {
  return MODEL_PRICING.filter((model) => model.provider === provider);
}

export function getDefaultModel(provider: ProviderId) {
  return getModelsForProvider(provider)[0]?.modelId ?? "";
}

export function getDefaultBaseUrl(provider: ProviderId) {
  if (provider === "openai") {
    return "https://api.openai.com/v1";
  }

  if (provider === "kimi") {
    return "https://api.moonshot.ai/v1";
  }

  return "";
}
