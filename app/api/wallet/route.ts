import { NextResponse } from "next/server";

import { jsonInternalError, logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Your session ended. Sign in again to view credits." }, { status: 401 });
    }

    userId = user.id;
    const { data, error } = await supabase
      .from("credit_wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logServerError("api/wallet.query", error, { userId });
      return jsonInternalError("We couldn’t load your credit balance. Refresh the page and try again.");
    }

    return NextResponse.json({ balance: data?.balance ?? 0 });
  } catch (error) {
    logServerError("api/wallet", error, { userId });
    return jsonInternalError();
  }
}
