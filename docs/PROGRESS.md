# Progress
Current phase: 8
Last updated: 2026-10-10

- [x] Phase 0  Decisions and setup
- [x] Phase 1  Shell, database, design system
- [x] Phase 2  Login, roles, audit
- [x] Phase 3  Lists, customers, dresses
- [x] Phase 4  Booking screen
- [x] Phase 5  Payments and status
- [x] Phase 6  Availability and clash
- [x] Phase 7  Search and filters
- [x] Phase 8  Receipts and printing
- [ ] Phase 9  Delivery and return
- [ ] Phase 10 Reports and exports
- [ ] Phase 11 Access migration
- [ ] Phase 12 Backup and restore
- [ ] Phase 13 Cloud and sync
- [ ] Phase 14 Hardening and testing
- [ ] Phase 15 Packaging and go-live

---

## Phase 3 Implementation Status
- Lists service & IPC (`cities`, `casts`, `relations`, `categories`) with learning dropdown capability.
- Pre-seeded relations and common boutique entries.
- Customers service & IPC:
  - Phone stored strictly as text with leading zeros intact.
  - Name and phone duplicate prevention check.
  - CNIC validation & mask.
  - Role-guarded customer deletion (Owner only, cannot delete customer with active bookings).
- Dresses service & IPC:
  - Auto-generated sequential code (`D-0001`).
  - Normalized similarity check to suggest existing dress names.
  - Role-guarded rental rate updates (Owner only; Cashiers cannot set rate > 0).
  - Quick-add dress dialog & IPC API.
  - Soft deactivation instead of hard deletion.
- Customers & Dresses dashboard UI connected to real IPC APIs.

---

## Phase 4 Implementation Status
- Booking computation logic and rules:
  - Auto-incrementing `booking_no` starting at `412` on empty table.
  - Detail item ID format: `booking_no * 100 + line_no` (e.g. 41201).
  - Derived `booking_month` (`YYYY-MM`) and `total_returning_days` (difference in days).
  - Computed line totals (`qty * rate`) and grand total (`sum(lines) - discount`).
  - Live remaining amount calculated.
  - Single-transaction atomic writes with audit trail.
  - Soft-delete cascading to items (Owner only).
  - Today's summary IPC API (`deliveries`, `returns`, `overdue`, `pending`).
- Booking UI (`/bookings/new`):
  - Booking Card: auto booking number, status chip, city, booking/delivery/returning dates, notes.
  - Customer Card: search-as-you-type customer picker with phone/CNIC/booking count display.
  - Dresses Card: dress line picker with learning dropdown & quick-add, size, editable rate, quantity, condition notes, accessories toggles.
  - Rule 3 enforcement: prompts and jumps focus to delivery date if dress is added without delivery date.
  - Sticky bottom bar: live Grand Total, Paid, and Remaining balance with Save (Ctrl+S) and Cancel.
  - Draft auto-save: saves to `localStorage` every second with draft restore prompt upon reopening.
  - Bookings list (`/bookings`): real database listing, search, status filter chips, and action buttons.
  - Dashboard (`/dashboard`): connected to real `todaySummary` stats.

---

## Phase 5 Implementation Status
- **Payments Engine (`electron/payments/service.js` & IPC):**
  - Advance payment captured atomically with booking creation (`advance_amount`, `advance_method`, `advance_date`, `advance_note`).
  - Append-only ledger: records cannot be edited or deleted; corrections require voiding with a mandatory reason.
  - Void permission strictly Owner-only (Cashiers rejected with audit logging).
  - Live calculation: `remaining = Math.max(0, grand_total - sum(rental_payments where is_void = 0))`.
  - Security deposits (`kind: 'deposit'`) tracked separately and never deducted from rental remaining balance.
  - Live balance status: "Fully Paid ✓", "Overpaid (Rs X)", or "Remaining: Rs X".
  - Payments dashboard (`/payments`) connected to real database with search, method filters, date filters, and live revenue stats.
- **Booking Status Workflow:**
  - Status transitions strictly validated (`None`, `Open`, `Pending`, `Closed`).
  - `Closed` status guard: checks that all dresses are delivered, returned, and remaining balance is zero.
  - Missing checklist modal: clearly lists missing items in friendly Urdu/English.
  - Owner force-close override: Owner can close incomplete bookings with a logged override reason.
- **Manual Backup Engine (`electron/backup/service.js` & IPC):**
  - Uses safe SQLite online backup / `VACUUM INTO` ensuring zero data corruption during live operations.
  - Pre-verifies database with `PRAGMA integrity_check` before export.
  - Windows Save As native file dialog (`chooseAndSaveBackup`) for exporting directly to USB, external hard drive, or any user folder.
  - Default folder quick backup and backup history manager with file sizes and timestamps.
  - Dedicated Backup UI (`/backup`) with status badges, one-click manual export, and open folder button.

---

## Phase 8 Implementation Status
- **Receipts Engine (`electron/receipts/service.js`, `template.js` & IPC):**
  - High-performance HTML/CSS generator with offline font support & proper page breaks (`page-break-inside: avoid`).
  - **Two Professional Layouts:**
    - **80mm Thermal POS:** compact, high-contrast, dotted dividers, optimized for receipt printers.
    - **A4 Full Sheet:** elegant invoice layout with customer & shop signature rows.
  - Full bilingual Urdu & English support with RTL text alignment for notes, names, and terms.
  - Direct hardware print via Electron `webContents.print` with printer selection and copies support.
  - Native PDF export via Electron `webContents.printToPDF` and Windows native Save As dialog.
  - Automatic reprint detection: increments `receipt_print_count` in DB and marks subsequent prints with prominent **DUPLICATE COPY / نقل** badge.
  - Audited printing: every print event is logged to `audit_logs` (`RECEIPT_PRINTED`).
  - Rule 10 Enforcement: receipt button is disabled with tooltip *"Save the booking first"* until booking is saved.
  - "Save & Print" button on booking form atomically saves and opens print preview.
  - Reprint button integrated on Bookings list (`/bookings`) and Search results (`/search`).
- **Settings & Hardware Preferences (`electron/settings/service.js` & `/settings` UI):**
  - Persistent SQLite `settings` table with atomic upserts and audit logging.
  - Configurable shop name, tagline, address, phone 1, phone 2, and city.
  - Configurable Urdu & English return terms and policies.
  - Layout default preference (80mm vs A4) and printer selection per layout.
  - Toggle for "DUPLICATE / نقل" stamp on reprints.
  - Settings page connected to real DB with Owner-only authorization guard.

---

## Verification & Tests
- `npm test`: **108 / 108 unit tests passed** (0 failures, 11 dedicated tests for Phase 8 templates, layouts, Urdu text, reprint counters, settings, and roles).
- `npm run lint`: **0 errors, 0 warnings** (Clean ESLint check across all dashboard pages).
- `npm run build`: **Compiled & exported successfully** across all 19 static routes via Next.js Turbopack.

