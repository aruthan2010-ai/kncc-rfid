# KNCC RFID Attendance System

RFID-based student attendance management for **KN/Kilinochchi Central College**, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and Supabase (PostgreSQL, Auth, Realtime, Row Level Security).

No demo/mock data is included anywhere. Every table starts empty and the UI shows clean empty states until real data is added.

---

## 1. Features at a glance

- Email/password auth with a **Pending Approval** flow: the first person to register becomes Super Admin automatically; everyone after that is approved by an existing Super Admin, who assigns one role (Super Admin, Principal, Sectional Head, Teacher). Max 3 Super Admins, enforced in the database.
- Role-scoped dashboard, sidebar, and Row Level Security — Teachers/Sectional Heads only ever see their assigned classes/grades.
- Student roster, RFID card lifecycle (register / replace / disable / reassign), grades/divisions/classes, and class/grade staff assignments.
- Realtime **Live Attendance** feed and device status via Supabase Realtime.
- Attendance engine (`process_rfid_scan` SQL function) that turns a raw RFID tap into an Entry or Exit record, applies the "late after" rule, and blocks duplicate scans within a configurable window.
- Secure API routes for ESP32 devices: heartbeat, live scan submission, offline batch sync, card registration scan, and status update — authenticated with a shared device secret, never exposed to the browser.
- Reports (daily / monthly / grade-wise / class-wise / student summary) with a print-to-PDF action.
- Audit log, comments, and school settings (attendance rule configuration).

---

## 2. Prerequisites

- Node.js 18.18+ (20 LTS recommended)
- A free [Supabase](https://supabase.com) project
- (Optional, for hardware) ESP32 boards with an RFID reader, RTC module, and MicroSD card

---

## 3. Supabase setup

1. **Create a Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Run the schema.** Open the SQL Editor in your project, paste the entire contents of `supabase/schema.sql`, and run it. This creates every table, enum, index, trigger, RLS policy, and the `process_rfid_scan` attendance engine function. It intentionally inserts **no data** — every table starts empty.
3. **Enable Realtime** (already handled by the script for `attendance_records` and `attendance_devices`, but double check under *Database → Replication* that both tables are toggled on if you re-run the script on an older project).
4. **Copy your API keys.** Go to *Project Settings → API* and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — server-only)
5. **Generate a device secret.** Create a long random string (e.g. `openssl rand -hex 32`) for `DEVICE_API_SECRET`. You will flash this same value into every ESP32 device's firmware config.
6. Optional: under *Authentication → Email Templates / URL Configuration*, set your production site URL so confirmation/reset links point to the right place.

---

## 4. Local setup

```bash
# 1. Configure environment variables
cp .env.example .env.local
# then fill in the four values from step 3 above

# 2. Install dependencies
npm install

# 3. Run the dev server
npm run dev
```

Visit `http://localhost:3000`, register the first account — it becomes Super Admin automatically — then sign in.

Add your three attendance devices (`RFID-01` — Main Gate, `RFID-02` — Primary Block, `RFID-03` — Rear Entrance) from **RFID Devices** so the ESP32 endpoints below have somewhere to report to.

---

## 5. Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, "Add New Project" → import the repo.
3. Add the same four environment variables from `.env.example` in the Vercel project settings (Production **and** Preview).
4. Deploy. Update your Supabase Auth "Site URL" / redirect URLs to your Vercel domain.

---

## 6. ESP32 device API reference

All device endpoints live under `/api/device/*`, are excluded from the browser auth middleware, and require a JSON body containing `device_id` (the device's `device_code`, e.g. `"RFID-01"`) and `device_secret` (your `DEVICE_API_SECRET`). They use the Supabase **service role** key server-side only — it never reaches the browser or the ESP32 firmware.

| Endpoint | Purpose |
|---|---|
| `POST /api/device/heartbeat` | Periodic "I'm alive" ping. Marks the device online, records firmware/IP, stores a `device_heartbeats` row. |
| `POST /api/device/scan` | Submit a single live scan while online. Runs the attendance engine and returns the resulting entry/exit + present/late status, or `duplicate_blocked` / `card_invalid`. |
| `POST /api/device/sync` | Submit an array of scans buffered on the SD card while offline. Each is queued in `attendance_sync_queue`, then processed with the same duplicate-safe engine. |
| `POST /api/device/register-card` | "Enrollment mode" tap: registers a brand-new RFID UID as `unregistered` (no student, no attendance record) so a Super Admin can assign it from **RFID Cards**. |
| `POST /api/device/status` | Explicit online/offline announcement (e.g. on boot or graceful shutdown), independent of the heartbeat cycle. |

Example scan submission:

```bash
curl -X POST https://your-domain.com/api/device/scan \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "RFID-01",
    "device_secret": "YOUR_DEVICE_API_SECRET",
    "rfid_uid": "A1B2C3D4",
    "timestamp": "2026-08-15T07:42:10+05:30"
  }'
```

### Suggested ESP32 firmware flow

1. Read UID from the RFID module.
2. Read the current time from the RTC module.
3. Append `{ rfid_uid, scanned_at }` to a local buffer file on the MicroSD card.
4. If Wi-Fi is connected, `POST /api/device/scan` immediately; on success, drop the record from the SD buffer.
5. If offline, leave it buffered and keep scanning.
6. On a timer (or on reconnect), `POST /api/device/sync` with all buffered records still on the card, then clear the ones the response marks `"synced"`.
7. Every 30–60s, `POST /api/device/heartbeat` with `pending_records` = count still buffered.

---

## 7. Project structure

```
src/
  app/
    (auth)/            login, register, forgot-password, reset-password
    pending-approval/
    (dashboard)/        all authenticated pages (dashboard, students, rfid-cards, ...)
    api/device/         ESP32-facing API routes
  components/
    ui/                 shared UI primitives (Modal, EmptyState, Badge, StatCard, ...)
    layout/              Sidebar, Topbar, DashboardShell
  lib/
    supabase/            browser client, server client, service-role client, middleware helper
    auth.ts              server-side profile/role guards
    audit.ts              audit log helper
    device-auth.ts        shared-secret verification for device API routes
  middleware.ts           route protection + role-based section gating
  types/index.ts           shared TypeScript types + role/nav config
supabase/
  schema.sql               full database schema, RLS policies, and attendance engine (no seed data)
```

---

## 8. Notes on empty states & no seed data

Every list/table page (Students, RFID Cards, Attendance, Reports, Devices, etc.) checks for zero rows and renders a dedicated "no data yet" empty state with guidance — dashboard totals show `0` rather than placeholder numbers. Nothing in this repository inserts sample students, cards, users, or attendance records; the three named devices (RFID-01/02/03) must be added manually from the **RFID Devices** page, not via the schema script.
