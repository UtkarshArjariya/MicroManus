# MicroManus application flow

The user-facing flow is deliberately linear:

1. `/login` — sign in with Google or GitHub.
2. `/paywall` — users with no credits must redeem the launch coupon or buy credits.
3. `/app` — routes to the most recently used chat, or `/app/new` when no chat exists.
4. The authenticated app shell persists around every workspace page:
   - `/app/new` starts a new conversation.
   - `/app/[chatId]` shows one conversation and its research trace/artifacts.
   - `/app/stats` shows the full usage ledger.
   - The account control opens Settings over the current page without navigation.
5. Settings is one modal with Profile, Appearance, API Keys, and Billing tabs. Closing it returns to the unchanged page underneath.
6. `/admin` is a separate, credit-independent server-guarded workspace for designated administrators:
   - `/admin` shows aggregate operating totals.
   - `/admin/users` and `/admin/users/[userId]` expose cross-user ledgers and safe provider metadata.
   - `/admin/coupons` manages table-backed coupon definitions without deleting redemption history.
   - Every admin data request is re-authorized under `/api/admin/*`; the client never receives encrypted provider-key values.

The shell owns the product wordmark, primary navigation, active-location state, chat history, credit/account control, account menu, and Settings modal. Authenticated pages provide only their page-specific content so Chat and Stats cannot drift into separate navigation structures.
