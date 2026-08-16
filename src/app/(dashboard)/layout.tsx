import { requireApprovedProfile } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireApprovedProfile();
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("school_settings")
    .select("school_name, school_logo_url")
    .eq("id", 1)
    .maybeSingle();

  return (
    <DashboardShell profile={profile} logoUrl={settings?.school_logo_url ?? null} schoolName={settings?.school_name}>
      {children}
    </DashboardShell>
  );
}
