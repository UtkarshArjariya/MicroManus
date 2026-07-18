import { redirect } from "next/navigation";

export default function LegacyKeysPage() {
  redirect("/app/new?settings=api-keys");
}
