"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { ImageIcon, Loader2, Save, Settings2, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import type { SchoolSettings } from "@/types";

const emptyForm = {
  school_name: "KN/Kilinochchi Central College",
  school_start_time: "07:30",
  late_after_time: "07:45",
  school_end_time: "13:30",
  entry_exit_cutover_time: "11:00",
  duplicate_scan_window_seconds: 60,
};

const LOGO_BUCKET = "school-assets";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

export default function SettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
    if (error) toast.error(error.message);
    if (data) {
      const s = data as SchoolSettings;
      setForm({
        school_name: s.school_name,
        school_start_time: s.school_start_time?.slice(0, 5) ?? "07:30",
        late_after_time: s.late_after_time?.slice(0, 5) ?? "07:45",
        school_end_time: s.school_end_time?.slice(0, 5) ?? "13:30",
        entry_exit_cutover_time: s.entry_exit_cutover_time?.slice(0, 5) ?? "11:00",
        duplicate_scan_window_seconds: s.duplicate_scan_window_seconds ?? 60,
      });
      setLogoUrl(s.school_logo_url ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be smaller than 2MB.");
      return;
    }

    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `logo/school-logo-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadErr) {
      setUploadingLogo(false);
      toast.error(uploadErr.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
    const { data: userData } = await supabase.auth.getUser();
    const { error: saveErr } = await supabase.from("school_settings").upsert({
      id: 1,
      school_name: form.school_name.trim(),
      school_logo_url: publicUrlData.publicUrl,
      school_start_time: form.school_start_time,
      late_after_time: form.late_after_time,
      school_end_time: form.school_end_time,
      entry_exit_cutover_time: form.entry_exit_cutover_time,
      duplicate_scan_window_seconds: Number(form.duplicate_scan_window_seconds),
      updated_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setUploadingLogo(false);
    if (saveErr) {
      toast.error(saveErr.message);
      return;
    }
    setLogoUrl(publicUrlData.publicUrl);
    toast.success("School logo updated");
  }

  async function handleLogoRemove() {
    setUploadingLogo(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("school_settings")
      .update({ school_logo_url: null, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setUploadingLogo(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLogoUrl(null);
    toast.success("School logo removed");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("school_settings").upsert({
      id: 1,
      school_name: form.school_name.trim(),
      school_start_time: form.school_start_time,
      late_after_time: form.late_after_time,
      school_end_time: form.school_end_time,
      entry_exit_cutover_time: form.entry_exit_cutover_time,
      duplicate_scan_window_seconds: Number(form.duplicate_scan_window_seconds),
      updated_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Configure school identity and attendance rules used by the scan-processing engine." />

      <div className="card mb-5 space-y-4 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <ImageIcon className="h-4 w-4 text-brand-600" /> School Logo
        </div>
        <p className="text-xs text-slate-400">
          Shown in the sidebar and on the sign-in screen. Only a Super Admin can change this. PNG or JPG, up to 2MB.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
            ) : (
              <ImageIcon className="h-6 w-6 text-slate-300" />
            )}
          </div>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <button type="button" className="btn-outline" disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()}>
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {logoUrl ? "Replace logo" : "Upload logo"}
            </button>
            {logoUrl && (
              <button type="button" className="btn-outline text-red-600" disabled={uploadingLogo} onClick={handleLogoRemove}>
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="card space-y-5 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Settings2 className="h-4 w-4 text-brand-600" /> Attendance Rules
        </div>
        <div>
          <label className="label">School name</label>
          <input className="input" value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">School start time</label>
            <input type="time" className="input" value={form.school_start_time} onChange={(e) => setForm({ ...form, school_start_time: e.target.value })} />
          </div>
          <div>
            <label className="label">Late after</label>
            <input type="time" className="input" value={form.late_after_time} onChange={(e) => setForm({ ...form, late_after_time: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">Scans after this time are marked "Late" instead of "Present".</p>
          </div>
          <div>
            <label className="label">School end time</label>
            <input type="time" className="input" value={form.school_end_time} onChange={(e) => setForm({ ...form, school_end_time: e.target.value })} />
          </div>
          <div>
            <label className="label">Entry/exit cutover</label>
            <input type="time" className="input" value={form.entry_exit_cutover_time} onChange={(e) => setForm({ ...form, entry_exit_cutover_time: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">Reference time used for reporting on entry vs. exit windows.</p>
          </div>
        </div>
        <div>
          <label className="label">Duplicate scan window (seconds)</label>
          <input
            type="number"
            min={5}
            max={3600}
            className="input sm:w-48"
            value={form.duplicate_scan_window_seconds}
            onChange={(e) => setForm({ ...form, duplicate_scan_window_seconds: Number(e.target.value) })}
          />
          <p className="mt-1 text-xs text-slate-400">A second tap of the same card within this window is ignored as a duplicate.</p>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
