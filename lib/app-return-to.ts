export const DEFAULT_APP_RETURN_TO = "/app";

const APP_RETURN_BASE = "https://micromanus.local";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * Accept only an origin-relative route inside the authenticated `/app` tree.
 * Keeping this deliberately narrower than a generic URL validator prevents
 * coupon actions and Stripe callbacks from becoming open redirects.
 */
export function validateAppReturnTo(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const candidate = value.trim();
  if (
    candidate.length === 0 ||
    candidate.length > 2_048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(candidate)
  ) {
    return null;
  }

  try {
    const url = new URL(candidate, APP_RETURN_BASE);
    if (
      url.origin !== APP_RETURN_BASE ||
      (url.pathname !== "/app" && !url.pathname.startsWith("/app/"))
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function resolveAppReturnTo(value: unknown) {
  return validateAppReturnTo(value) ?? DEFAULT_APP_RETURN_TO;
}

export function setAppReturnToSearchParam(returnTo: string, key: string, value: string) {
  const safeReturnTo = resolveAppReturnTo(returnTo);
  const url = new URL(safeReturnTo, APP_RETURN_BASE);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}
