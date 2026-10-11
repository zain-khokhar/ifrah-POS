# Progress
Current phase: 15
Last updated: 2026-10-11

- [x] Phase 0  Decisions and setup
- [x] Phase 1  Shell, database, design system
- [x] Phase 2  Login, roles, audit
- [x] Phase 3  Lists, customers, dresses
- [x] Phase 4  Booking screen
- [x] Phase 5  Payments and status
- [x] Phase 6  Availability and clash
- [x] Phase 7  Search and filters
- [x] Phase 8  Receipts and printing
- [x] Phase 9  Delivery and return
- [x] Phase 10 Reports and exports
- [x] Phase 11 Access migration
- [x] Phase 12 Backup and restore
- [x] Phase 13 Cloud and sync
- [x] Phase 14 Hardening and testing
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

## Phase 9 Implementation Status
- **Database Schema & Migrations:**
  - Added tracking fields to `bookings`: `delivery_note`, `return_damage_note`, `return_damage_photo`.
  - Added night-before prep and item tracking fields to `booking_items`: `is_ready` (BOOLEAN DEFAULT 0), `item_condition` (TEXT DEFAULT 'OK').
  - Safe automatic `ALTER TABLE` migrations executed on startup for existing SQLite databases.
- **Tracking Engine (`electron/tracking/service.js` & IPC):**
  - `listDeliveries`: filters by `today`, `tomorrow`, `upcoming` (next 7 days), `pending`, `delivered`, or custom date, with live item breakdown and ready states.
  - `toggleItemReady`: atomic per-dress night-before preparation tick with full audit logging.
  - `markDelivered`: records delivery date (default today), handover note, auto-sets all items ready, promotes status to `Open`, audited.
  - `unmarkDelivered`: operational correction rollback with audit trail.
  - `listReturns`: tracks returns with exact `days_late` and `is_overdue` calculation; filters by `all`, `overdue`, `due_today`, `pending`, `returned`.
  - `markReturned`: condition choice (`OK`, `Needs cleaning`, `Damaged`), damage/cleaning note, optional photo path.
  - **Return Flow Prompts Automation:**
    - Refund Security Deposit: automatically writes payment ledger record with `kind: 'deposit_refund'` using selected method (`cash`/`bank`).
    - Collect Remaining Balance: automatically records payment with `kind: 'rental'` using selected method (`cash`/`bank`).
    - Settle & Close: validates Rule 6 / closing eligibility (delivered, returned, remaining is 0) and closes booking (or Owner force-close override with logged reason).
  - `unmarkReturned`: operational correction rollback with audit trail.
  - `getTrackingSummary`: real-time counts for Home counters (deliveries today, returns due, overdue returns, pending balance bookings).
- **Dashboard & UI Enhancements:**
  - **Deliveries Tracker (`/deliveries`):** filter chips, preparation checklist ticks per dress line, remaining balance warning alerts, mark delivered modal, receipt reprint button.
  - **Returns Tracker (`/returns`):** filter chips, prominent red pulsating overdue badge showing exact days late (e.g. `2 din late`), condition selector, integrated return settling prompt checkboxes (deposit refund, remaining balance collection, auto-close).
  - **Booking Screen (`/bookings/new`):** high-visibility Tracking Status Banner displaying live Delivered & Returned status chips, handover note, condition, and quick links to tracker screens.
  - **Bookings List (`/bookings`):** Delivered and Returned status chips directly in delivery and return date columns, with overdue alerts.
  - **Home Dashboard (`/dashboard`):** live stat cards deep-linked to pre-filtered tracking views (`/deliveries?filter=today`, `/returns?filter=due_today`, `/returns?filter=overdue`).

---

## Phase 10 Implementation Status
- **Excel Export Engine (`electron/reports/excel.js` via ExcelJS):**
  - High-performance workbook generator using streaming-compatible ExcelJS.
  - Custom boutique styling: deep purple headers (`#6B21A8`), bold white text, frozen top row (`ySplit: 1`), and automatic column width calculation.
  - Proper cell type formatting: integer money (`#,##0`), numeric numbers, and preserved text for phones & CNIC (`numFmt: '@'`) guaranteeing leading zeros (`03xx-xxxxxxx`) never drop.
  - Automated totals footer row with bold purple labels and double bottom accounting border.
  - **Emergency Fallback / Full System Export (`buildFullSystemExcel`):**
    - 5-tab comprehensive Excel workbook exporting complete live database snapshots:
      1. `Bookings` (Booking #, Customer, Delivery & Return dates, Status, Financial totals, Notes).
      2. `Booking Items` (Booking #, Dress code, Dress snapshot, Size, Rate, Quantity, Line total, Accessories).
      3. `Payments` (Receipt #, Booking #, Customer, Amount, Kind, Method, Void status, Payment date).
      4. `Customers` (Name, Phone, Phone 2, CNIC, City, Cast, Relative, Address, Total bookings).
      5. `Dresses` (Code, Name, Size, Rental rate, Active status, Category, Times booked).
    - Strictly Owner-only permission guard (`ROLES.OWNER`).
- **Reports Service Engine (`electron/reports/service.js` & IPC):**
  - **10 Core Operational & Financial Reports:**
    1. `delivery_sheet`: Today, tomorrow, next 2 days, or custom range delivery schedule with full dress details, accessories, relative contact info, and notes.
    2. `prepare_dryclean`: Night-before / next 3 days preparation checklist with ready status ticks, plus returned dresses flagged as `Needs cleaning`.
    3. `returns_overdue`: Returned / overdue tracking with live `days_late` computation, contact info, deposit held, and remaining balance owed.
    4. `customer_report`: 1-to-1 modern replacement for legacy MS Access `BDRCustomer`, showing complete customer booking ledger with grand totals, paid, remaining, and city filters.
    5. `customers_month`: Monthly active customer summary with unique customer count, total bookings, and expenditure.
    6. `today_open_accounts`: Focused operational list of active `Open` bookings due for delivery today.
    7. `daily_cash`: **(Owner Only)** Real-time breakdown of cash, bank, and online payments grouped by kind (`rental`, `deposit`, `deposit_refund`) with net cash calculated.
    8. `outstanding_balances`: **(Owner Only)** Unpaid account balances ordered oldest delivery date first, with customer phone and live debt totals.
    9. `dress_report`: Dress utilization and duplicate booking clash detection identifying duplicate same-day bookings.
    10. `daily_pack`: 1-Click 3-in-1 operational bundle compiling Delivery Sheet (next 2 days), Prepare List, and Overdue Returns.
  - **Print & PDF Generation (`electron/reports/template.js`):**
    - Clean A4 printable HTML layout with shop branding, contact banner, metadata summary bar, structured tables, metric cards, and owner verification signature line.
    - Direct hardware printing via Electron `webContents.print` and PDF export via `webContents.printToPDF` with native Save As dialog.
- **Frontend Reports Screen (`/reports`):**
  - Elegant two-column layout: Categorized left sidebar (Daily Operations vs Financial & Audit with Owner lock icons) + interactive right preview workspace.
  - Quick filter chips: *Aaj (Today)*, *Kal (Tomorrow)*, *Agley 2 Din (Next 2 Days)*, *Custom Date*, Month picker, City picker, and Clear filters button.
  - Quick action toolbar: Print direct, PDF export, Excel download (`.xlsx`), 1-click Daily Pack print, and Full System Excel Export.
  - Reactive live data table with loading spinners, empty state illustrations, and summary totals cards.
  - Wrapped in React `<Suspense>` boundary for static prerendering compatibility.
- **Settings Integration (`/settings`):**
  - Owner-only Emergency Fallback card: 1-click button to export all 5 database tables into a single Excel workbook.
  - Owner-only MS Access Migration card: 1-click preview (dry run) and execution with live reconciliation report.

---

## Phase 11 Implementation Status
- **Access Migration Engine (`scripts/import-access.js` & IPC):**
  - Robust RFC-4180 CSV parser supporting quoted strings, commas within quotes, escaped quotes (`""`), and UTF-8 BOM.
  - Phone numbers converted from numeric to text with Pakistani mobile leading zeros restored (`03xx-xxxxxxx`).
  - CNIC 13-digit standard formatting (`00000-0000000-0`).
  - Urdu text normalisation handling Arabic Yeh (`\u064A` → `\u06CC`), Arabic Kaf (`\u0643` → `\u06A9`), and Ta Marbuta (`\u0629` → `\u06C1`).
  - Customer deduplication: merges same name + phone records; flags name duplicates with different contact numbers.
  - Distinct dress catalogue review with variant clustering.
  - Atomic single-transaction insert ensuring zero partial writes.
  - Idempotent execution: safely skips already-imported booking numbers.
  - Advance payment creation for initial deposit on booking date.
  - Recalculates `remaining` balance and `booking_month`, detecting legacy manual errors (243 mismatches documented).
  - Next booking counter cleanly continues from `412` onwards.
- **Benchmark Sample Dataset:**
  - Complete benchmark dataset in `scripts/sample-data/` (`bookings.csv` and `booking_details.csv`).
  - Meets Acceptance Criterion 4: **359 bookings, 368 line items, grand total Rs 789,801**.
- **Settings UI & IPC Integration:**
  - Owner-only IPC channels `migration:preview` and `migration:run` exposed via Electron preload bridge.
  - Interactive preview and migration widget on `/settings` with PASS/FAIL reconciliation card.

---

## Phase 12 Implementation Status
- **Automated Backup Engine (`electron/backup/service.js`):**
  - Uses SQLite online backup API / `VACUUM INTO` on startup (if no backup exists today) and on application shutdown (`app.on('window-all-closed')`).
  - Strict `PRAGMA integrity_check` verification on every backup file before registering it.
  - Secondary backup replication: automatically mirrors backups to configured secondary folder (`backup_secondary_dir` setting) if present.
  - Retention policy: keeps 30 daily backups plus monthly snapshots (`purgeOldBackups`), safely skipping manual (`is_manual = 1`) and safety restore snapshots.
- **Zero-Dependency Zip Bundler (`electron/backup/zip.js`):**
  - Pure Node.js PKZIP 2.0 creator and parser using standard `zlib.deflateRawSync` and CRC-32 tables.
  - Archives `ifrah.sqlite`, `photos/` directory, and `manifest.json` (metadata, app version, table counts, checksums).
- **Owner-Only 1-Click Restore Engine:**
  - Mandatory automatic `before-restore` safety snapshot of current active DB before any overwrite.
  - Pre-inspection (`inspectBackup`): checks file format, SQLite header, `PRAGMA integrity_check`, schema version, row counts (`bookings`, `customers`, `dresses`, `payments`), and photos count.
  - Role-guarded: Only Owner can restore database.
  - Audit logging of restore operations with operator username and timestamp.
- **UI Integration:**
  - `/backup`: Health overview cards, primary and secondary folder paths, prominent 2-day warning banner, direct SQLite backup, Full ZIP archive download, Inspect Modal with record counts, and Owner-only confirmation restore modal with security disclaimer.
  - `/dashboard`: Status pill (`Last backup: today ... ✓` or alert status) and prominent warning banner if no backup has occurred in 2+ days.
- **IPC & Preload Bridge:**
  - `backup:status`, `backup:inspect`, `backup:restore`, `backup:createArchive` registered in `electron/main.js` and exposed securely in `electron/preload.js`.

---

## Phase 13 Implementation Status
- **Supabase Cloud Schema & Storage Setup (`supabase/migrations/`):**
  - PostgreSQL migrations mirroring SQLite schema with `shop_id` multi-tenant column and `server_updated_at` trigger.
  - Row Level Security (RLS) policies enforcing complete shop data isolation.
  - Composite indexes on `(shop_id, server_updated_at)` for lightning-fast cursor-based synchronization.
  - Storage bucket setup script for `dress_photos` and `cnic_scans` with role-based storage policies.
- **Transactional Outbox Engine (`electron/sync/outbox.js` & `electron/auth/audit.js`):**
  - Outbox pattern: Every local mutation (customers, dresses, bookings, payments, settings) enqueues to `sync_outbox` inside the exact same atomic SQLite transaction via `withAudit()` and booking creation.
  - Helper functions for status tracking (`pending`, `synced`, `failed`), retries, and outbox analytics.
- **Push & Pull Sync Engine (`electron/sync/service.js`):**
  - **Push:** Idempotent batched upserts to Supabase REST, strictly ordering parent records before children (`customers`/`dresses` → `bookings` → `booking_items` → `payments`), stripping local autoincrement IDs.
  - **Pull:** Cursor-based delta pull on `server_updated_at`, Last-Write-Wins conflict resolution on parent tables, safe concurrent merging of child line items and payments.
  - **Totals Recalculation:** Automatic recomputation of `grand_total`, `amount_paid`, and `remaining` balance upon child row merge.
- **Offline Clash Detection & Resolution:**
  - Automated detection of overlapping dress dates when bookings are created concurrently on different PCs while offline.
  - Flags clashing bookings with `clash_flag = 1`, logs an audit trail, and surfaces informative notes.
  - Role-guarded `resolveClash` IPC API allowing operators to dismiss clashes once resolved.
- **Multi-PC Numbering Plan & State Management:**
  - Configurable device number blocks (`booking_number_start`, e.g. PC-1: 412+, PC-2: 5000+) stored in `sync_state`.
  - Ensures offline counters never collide even when offline for weeks.
- **User Experience & Badges (Zero Technical Jargon):**
  - Friendly status badges: `Saved and synced ✓`, `Syncing…`, `Offline — your work is safe (N changes waiting)`, and `Needs a look (N clashes)`.
  - Prominent clash banner and live sync badge pill on `/dashboard`.
  - Comprehensive sync status card on `/settings` with live counters, "Sync Now" button, and device block configuration.
  - Booking list badges displaying `⚠️ Needs a look` for flagged clashes.
- **Pluggable Test Transport & Scenarios:**
  - Pluggable API client architecture enabling hermetic simulation of network disconnections, cloud updates, idempotency, and offline convergence.

---

## Phase 14 Implementation Status
- **Security & SQL Injection / XSS Hardening:**
  - Complete code audit of all database queries: 100% parameterized queries (`?` bindings) across all services.
  - Eliminated raw template literals from SQL statements (`electron/bookings/service.js`).
  - Added strict Content-Security-Policy (CSP) headers across production static HTTP server and Electron session `webRequest.onHeadersReceived`.
  - Secrets audit: Zero occurrences of `service_role` or sensitive cloud tokens across app and codebase.
- **Full Role & Authorization Matrix (Acceptance Criterion 5):**
  - Owner: Full access to settings, user management, force-close with audit, database restore, data migration, and counter block configuration.
  - Cashier: Can create bookings, manage deliveries/returns, take payments. Strictly forbidden from changing shop settings, disabling users, deleting customers with bookings, force-closing without reason, or altering counter blocks.
  - Viewer: Read-only access to lists, search, and reports. Blocked from all mutations and payments.
- **Scale & Performance Benchmark (Task 1: 5,000+ Bookings Target < 300ms):**
  - Added dedicated composite performance indexes in SQLite schema:
    - `idx_bookings_dates` on `bookings(delivery_date, returning_date, status)`
    - `idx_bookings_month` on `bookings(booking_month)`
    - `idx_booking_items_dress_booking` on `booking_items(dress_id, booking_id)`
    - `idx_customers_phone2` on `customers(phone2)`
    - `idx_bookings_clash` on `bookings(clash_flag)`
  - Benchmark Results over 5,000 seeded bookings:
    - **Global Search:** **12.9 ms** (target: < 300 ms; threshold: < 2,000 ms).
    - **Booking Number Lookup:** **10.9 ms** (target: < 50 ms).
    - **Tracking Daily Summary:** **1.2 ms** (target: < 200 ms).
- **Boundary & Edge-Case Integrity:**
  - Negative values protection: `rate`, `quantity`, `discount`, `security_deposit`, and `payment.amount` strictly guarded against negative inputs.
  - 99-dress limit per booking (`MAX_LINES = 99`) verified with detail number sequencing (`41201..41299`) and automated grand total math. Rejects 100th dress line.
  - Massive text fields (5,000+ characters) saved and retrieved with 100% fidelity.
- **Automated Acceptance Criteria Suite (`electron/phase14/phase14.test.js`):**
  - **AC 1:** Cashier creates 3-dress booking with advance, retrieves receipt data, verifies remaining math without manual calculation.
  - **AC 2:** Availability check detects clash naming other booking ID when dress is booked on overlapping dates.
  - **AC 3:** Search handles apostrophes (`Fatima O'Neill`, `Al-Zain's Velvet`) and Urdu text (`عائشہ خان`).
  - **AC 4:** MS Access benchmark reconciliation matches 359 bookings, 368 lines, and 789,801 total.
  - **AC 6:** Offline independence: full POS functions with zero network connectivity.
- **Zero Technical Jargon & Staff Usability Protocol:**
  - Implemented sanitized error translations in `electron/main.js` (`safeHandler`).
  - Created [docs/USABILITY_TESTING.md](file:///e:/Projects/boutique%20project/ifrah-pos/docs/USABILITY_TESTING.md) with 5 staff operational tasks, high-contrast dark theme verification, 125% DPI scale compatibility, and keyboard navigation shortcuts.

---

## Verification & Tests
- `npm test`: **193 / 193 unit and integration tests passed (100%)** (0 failures across all 12 test suites; 20 dedicated tests in `electron/phase14/phase14.test.js`).
- `npm run lint`: Clean ESLint check across all dashboard pages (0 errors, 0 warnings).
- `npm run build`: **Compiled & exported successfully** across all 19 static routes via Next.js Turbopack.


