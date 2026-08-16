import { School } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("school_settings")
    .select("school_name, school_logo_url")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-950 via-brand-900 to-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg">
            {settings?.school_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.school_logo_url} alt={settings.school_name ?? "School logo"} className="h-full w-full object-contain" />
            ) : (
              <School className="h-7 w-7 text-brand-600" />
            )}
          </div>
          <h1 className="text-lg font-semibold text-white">KNCC RFID Attendance System</h1>
          <p className="mt-1 text-sm text-brand-200">{settings?.school_name ?? "KN/Kilinochchi Central College"}</p>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
