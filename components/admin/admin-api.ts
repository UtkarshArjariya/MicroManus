export async function adminApi<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => null) as ({ error?: string } & T) | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "The admin request could not be completed.");
  }

  if (!payload) {
    throw new Error("The admin request returned an empty response.");
  }

  return payload;
}

export function formatAdminDate(value: string | null, includeTime = false) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatAdminMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
  }).format(value);
}

export function formatAdminNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}
