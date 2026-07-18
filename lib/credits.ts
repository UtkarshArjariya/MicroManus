export const VALID_COUPON_CODE = "SID_DRDROID";
export const CREDIT_UNLOCK_AMOUNT = 5;
export const STRIPE_UNLOCK_PRICE_DISPLAY = "₹399";
export const STRIPE_UNLOCK_AMOUNT_MINOR = 39_900;
export const STRIPE_UNLOCK_CURRENCY = "inr";

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}
