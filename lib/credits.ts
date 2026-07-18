export const VALID_COUPON_CODE = "SID_DRDROID";
export const CREDIT_UNLOCK_AMOUNT = 5;
export const STRIPE_UNLOCK_COPY = "Pay $5 for 5 credits";

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}
