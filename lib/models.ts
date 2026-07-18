export type ProviderId = "openai" | "anthropic" | "google" | "kimi" | "openai_compatible";
export type ProviderApiFormat = "openai" | "anthropic" | "google";

export const PROVIDER_API_FORMATS: Array<{ value: ProviderApiFormat; label: string; description: string }> = [
  {
    value: "openai",
    label: "OpenAI-compatible",
    description: "Uses /chat/completions with Bearer authentication.",
  },
  {
    value: "anthropic",
    label: "Anthropic-compatible",
    description: "Uses /messages with x-api-key authentication.",
  },
  {
    value: "google",
    label: "Google Gemini",
    description: "Uses Gemini generateContent with x-goog-api-key authentication.",
  },
];

export function isProviderApiFormat(value: string): value is ProviderApiFormat {
  return PROVIDER_API_FORMATS.some((format) => format.value === value);
}

export function getProviderApiFormat(provider: ProviderId, savedFormat?: string | null): ProviderApiFormat {
  if (provider === "anthropic") return "anthropic";
  if (provider === "google") return "google";
  if (provider === "openai_compatible" && savedFormat && isProviderApiFormat(savedFormat)) return savedFormat;
  return "openai";
}

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
    modelId: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    inputPricePerM: 0.4,
    outputPricePerM: 1.6,
    cachedInputPricePerM: 0.1,
    supportsPromptCaching: true,
    note: "Stable Chat Completions default; pricing can change and should be reviewed periodically.",
  },
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
    modelId: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    inputPricePerM: 3,
    outputPricePerM: 15,
    cachedInputPricePerM: 0.3,
    supportsPromptCaching: true,
    note: "Stable Messages API default; pricing can change and should be reviewed periodically.",
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
    provider: "google",
    modelId: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    inputPricePerM: 0,
    outputPricePerM: 0,
    cachedInputPricePerM: null,
    supportsPromptCaching: false,
    note: "Usage is tracked, but Google cost is left at zero until pricing is reviewed for the active account tier.",
  },
  {
    provider: "google",
    modelId: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    inputPricePerM: 0,
    outputPricePerM: 0,
    cachedInputPricePerM: null,
    supportsPromptCaching: false,
    note: "Usage is tracked, but Google cost is left at zero until pricing is reviewed for the active account tier.",
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
  if (provider === "openai") return "gpt-4.1-mini";
  if (provider === "anthropic") return "claude-sonnet-4-20250514";
  if (provider === "google") return "gemini-2.5-flash";
  if (provider === "kimi") return "kimi-k2.5";
  return "";
}

export function getDefaultBaseUrl(provider: ProviderId) {
  if (provider === "openai") {
    return "https://api.openai.com/v1";
  }

  if (provider === "kimi") {
    return "https://api.moonshot.ai/v1";
  }

  if (provider === "anthropic") {
    return "https://api.anthropic.com/v1";
  }

  if (provider === "google") {
    return "https://generativelanguage.googleapis.com/v1beta";
  }

  return "";
}
