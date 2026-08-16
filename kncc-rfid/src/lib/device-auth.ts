import { NextResponse } from "next/server";

/**
 * Verifies the shared DEVICE_API_SECRET sent by an ESP32 device. This
 * secret lives only in server environment variables (never in the
 * browser bundle, never in the database in plaintext) and is configured
 * into each device's firmware at flash time.
 *
 * Every device request must include:
 *  - device_id      (matches attendance_devices.device_code, e.g. "RFID-01")
 *  - device_secret   (the shared DEVICE_API_SECRET)
 *  - a timestamp for the event being reported
 *
 * Returns null if valid, or a NextResponse to return immediately if not.
 */
export function verifyDeviceSecret(body: any): NextResponse | null {
  const expected = process.env.DEVICE_API_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfiguration: DEVICE_API_SECRET is not set." },
      { status: 500 }
    );
  }
  if (!body?.device_id || typeof body.device_id !== "string") {
    return NextResponse.json({ error: "device_id is required." }, { status: 400 });
  }
  if (!body?.device_secret || body.device_secret !== expected) {
    return NextResponse.json({ error: "Invalid device credentials." }, { status: 401 });
  }
  return null;
}
