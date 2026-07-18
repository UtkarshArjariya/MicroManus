"use server";

import { redirect } from "next/navigation";

import { logServerError } from "@/lib/server-errors";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    logServerError("action/sign-out", error);
  }

  redirect("/login");
}
