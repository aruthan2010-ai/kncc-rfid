import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDeviceSecret } from "@/lib/device-auth";

/**
 * POST /api/device/sync
 * Called by an ESP32 device once it regains connectivity, to flush all
 * scans it buffered on its MicroSD card while offline. Each record is
 * inserted into attendance_sync_queue for a durable audit trail, then
 * immediately processed through the same attendance engine used for
 * live scans (public.process_rfid_scan) so entry/exit + late/present
 * logic and duplicate protection are identical for offline and online
 * scans.
 *
 * Body: {
 *   device_id: string,
 *   device_secret: string,
 *   records: Array<{
 *     rfid_uid: string,
 *     scanned_at: string,          // ISO 8601, captured from the RTC while offline
 *     attendance_type?: "entry" | "exit"  // advisory only
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const authError = verifyDeviceSecret(body);
  if (authError) return authError;

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json({ error: "records must be a non-empty array." }, { status: 400 });
  }
  if (body.records.length > 500) {
    return NextResponse.json({ error: "Batch too large; send at most 500 records per request." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: device, error: findErr } = await supabase
    .from("attendance_devices")
    .select("id")
    .eq("device_code", body.device_id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!device) {
    return NextResponse.json({ error: `Unknown device_id "${body.device_id}".` }, { status: 404 });
  }

  const results: any[] = [];

  for (const rec of body.records) {
    if (!rec?.rfid_uid || !rec?.scanned_at) {
      results.push({ rfid_uid: rec?.rfid_uid ?? null, status: "failed", error: "rfid_uid and scanned_at are required" });
      continue;
    }
    const scannedAt = new Date(rec.scanned_at);
    if (Number.isNaN(scannedAt.getTime())) {
      results.push({ rfid_uid: rec.rfid_uid, status: "failed", error: "invalid scanned_at" });
      continue;
    }

    const { data: queueRow, error: queueErr } = await supabase
      .from("attendance_sync_queue")
      .insert({
        device_id: device.id,
        rfid_uid: rec.rfid_uid,
        scanned_at: scannedAt.toISOString(),
        attendance_type: rec.attendance_type ?? null,
        status: "pending",
      })
      .select()
      .single();

    if (queueErr) {
      results.push({ rfid_uid: rec.rfid_uid, status: "failed", error: queueErr.message });
      continue;
    }

    const { data: procData, error: procErr } = await supabase.rpc("process_rfid_scan", {
      p_rfid_uid: rec.rfid_uid,
      p_device_code: body.device_id,
      p_scanned_at: scannedAt.toISOString(),
    });

    const result = Array.isArray(procData) ? procData[0] : procData;

    if (procErr || !result || result.result === "device_unknown") {
      await supabase
        .from("attendance_sync_queue")
        .update({ status: "failed", error_message: procErr?.message ?? "processing failed", attempts: 1 })
        .eq("id", queueRow.id);
      results.push({ rfid_uid: rec.rfid_uid, status: "failed", error: procErr?.message ?? "processing failed" });
      continue;
    }

    if (result.result === "card_invalid") {
      await supabase
        .from("attendance_sync_queue")
        .update({ status: "failed", error_message: "card invalid/unregistered", attempts: 1 })
        .eq("id", queueRow.id);
      results.push({ rfid_uid: rec.rfid_uid, status: "rejected", reason: "card_invalid" });
      continue;
    }

    // "ok" or "duplicate_blocked" both mean the queue item was legitimately
    // processed (duplicate prevention working as intended) - mark synced.
    await supabase
      .from("attendance_sync_queue")
      .update({
        status: "synced",
        processed_record_id: result.attendance_id ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", queueRow.id);

    results.push({ rfid_uid: rec.rfid_uid, status: "synced", result: result.result });
  }

  await supabase.from("attendance_devices").update({ status: "online", last_scan_at: new Date().toISOString() }).eq("id", device.id);

  return NextResponse.json({
    ok: true,
    processed: results.length,
    synced: results.filter((r) => r.status === "synced").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}
