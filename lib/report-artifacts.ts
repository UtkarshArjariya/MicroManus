import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const REPORT_ARTIFACTS_BUCKET = "report-artifacts";
export const REPORT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type SignedReportArtifact = {
  id: string;
  message_id: string;
  title: string;
  storage_path: string;
  created_at: string;
  signed_url: string;
  expires_at: string;
};

export function reportDownloadName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${slug || "micromanus-report"}.pdf`;
}

export async function createReportSignedUrl(storagePath: string, title: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(REPORT_ARTIFACTS_BUCKET)
    .createSignedUrl(storagePath, REPORT_SIGNED_URL_TTL_SECONDS, {
      download: reportDownloadName(title),
    });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create a signed report URL.");
  }

  return data.signedUrl;
}

