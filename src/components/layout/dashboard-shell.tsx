"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { Profile } from "@/types";

export function DashboardShell({
  profile,
  children,
  logoUrl,
  schoolName,
}: {
  profile: Profile;
  children: React.ReactNode;
  logoUrl?: string | null;
  schoolName?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={profile.role!} open={sidebarOpen} onClose={() => setSidebarOpen(false)} logoUrl={logoUrl} schoolName={schoolName} />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
        <Topbar profile={profile} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
