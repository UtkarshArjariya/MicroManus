export type AdminIdentity = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type StripeRevenueTotal = {
  currency: string;
  amountMinor: number;
};

export type AdminOverview = {
  totalUsers: number;
  totalCreditsIssued: number;
  couponCreditsIssued: number;
  stripeCreditsIssued: number;
  stripeRevenue: StripeRevenueTotal[];
  totalChats: number;
  totalMessages: number;
  totalLlmCostUsd: number;
  activeCoupons: number;
};

export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  signupDate: string;
  balance: number;
  totalChats: number;
  totalSpentUsd: number;
  providers: string[];
  lastActiveDate: string | null;
};

export type AdminLedgerRow = {
  id: string;
  delta: number;
  reason: string;
  referenceId: string | null;
  createdAt: string;
};

export type AdminChatRow = {
  id: string;
  title: string;
  model: string;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminProviderKeyMetadata = {
  id: string;
  provider: string;
  label: string;
  maskedKey: string;
  model: string;
  createdAt: string;
  lastTestedAt: string | null;
};

export type AdminUserDetailResponse = {
  user: AdminUserSummary;
  ledger: AdminLedgerRow[];
  chats: AdminChatRow[];
  providerKeys: AdminProviderKeyMetadata[];
};

export type AdminCoupon = {
  id: string;
  code: string;
  creditValue: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
};
