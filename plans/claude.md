# Ifrah Collection POS — AI Agent Build Plan (0 → 100)

*For the AI coding agent · Project owner: BARII · Version 1 · 9 Oct 2026 · Save this as `docs/PLAN.md` in the repo*

## 0. Rules the agent must follow (read first, obey always)

1. **Sources of truth:** this plan, `docs/source/ifrah_project.txt` (requirements F1–F20 and business rules) and `docs/source/audio-1…5.txt` (the shop owner's voice-note transcripts in Roman Urdu). If they disagree, the voice notes show what the owner really does every day. Tell the user about the conflict and ask.
2. **One phase at a time.** Never start phase N+1 until the user says phase N is done.
3. **Ask before configuring.** Before choosing, installing or configuring anything that is not already in `docs/DECISIONS.md` (libraries, versions, folders, printers, Supabase settings, keys, app name, installer options), stop and ask. Give your recommendation and a one-line reason. One question at a time, in plain words. Write the answer into DECISIONS.md.
4. **Language:** reply in the language the user writes (Roman Urdu / English mix is fine). Explain things simply. The shop staff are not technical.
5. **Progress tracking:** at the start of every session read `docs/PROGRESS.md` and `docs/DECISIONS.md` and say in 3 lines where we are. At the end of every phase update PROGRESS.md (tick tasks, date, what was tested, known issues, next phase) and give the user a short summary plus a manual test checklist of 5–10 click steps.
6. **Small, safe steps:** one task = one git commit. Do not rewrite unrelated code. Never delete user data or files without asking. Never commit secrets or real customer data (CNIC, phone numbers): `.env*` and `docs/source-data/` go into `.gitignore`.
7. **Test as you go:** business rules (totals, remaining, clash check, ID rules, validation) get unit tests before the UI. A phase is finished only when typecheck, lint and tests pass and the app starts.
8. **Secrets:** never put the Supabase `service_role` key or any admin secret in the Electron app or the repo. The app may only hold the public URL and anon key and sign in as a user.
9. **Sync-ready from day one:** every table follows the rules in section 4 even before Supabase exists.
10. **The UI rules in section 6 are requirements.** A screen is not done until it passes the section 6 checklist.
11. **Verify before coding:** versions and APIs of Electron, Next.js, Supabase, better-sqlite3 and Drizzle change often. Read the current official docs instead of relying on memory.
12. If the plan is wrong or unclear, say so, propose a change and wait for approval.

## 1. What we are building

Ifrah Collection is a **dress-rental shop**. A customer chooses dresses (and accessories) → a **booking** is made with delivery and return dates → an **advance** is paid → dresses are **delivered** → **returned** → the rest is paid → the booking is **closed**.

Today everything lives in one Microsoft Access file: 359 bookings (Jan–Oct 2026, IDs 47–411), 368 booking lines, grand totals adding up to 789,801. It has only 2 tables, no login, no dress stock list, no payment history, and known mistakes: hand-typed Remaining and Month, phone and CNIC numbers that lost their leading zeros, free-text dress names, broken city and cast lists, filters stuck inside reports.

**Goal:** a Windows desktop app that replaces Access, works fully **offline**, syncs to the cloud when internet exists, and is simple enough for a non-technical cashier to use on day one.

**What the owner said in the voice notes (daily pain, highest priority):**

1. Booking screen in this order: auto Booking ID → city → status (open/close) → month (auto) → booking / delivery / returning date → customer (name, phone, CNIC) → relative (relation, name, phone, CNIC) → cast → address → dresses.
2. **No field is mandatory.** Saving must never be blocked by an empty field (photos are optional too).
3. **Dropdowns that learn:** a new relation, city, cast or dress name typed once is added to the list automatically.
4. **Search anything** (booking ID, name, number, CNIC, dress) and find it instantly.
5. Each dress line: dress (from stock), description / condition note, accessories (jewellery, clutch purse, hand bag, double dupatta, shoes), quantity, rate, amount. Then the total and a **printed receipt**.
6. **Excel export everywhere.** It is the fallback when internet or the system fails.
7. **Daily printed reports (about 3):** dresses going out today and in the next 2 days (staff prepare and dry-clean them the night before; needs customer name, CNIC, phone), returns coming back, a customer report (open/closed, month, city, dress, total), customers this month, today's open entries.

**Plan change vs the requirements file:** the file puts reports and delivery/return tracking in a later phase. The voice notes make them a daily need, so this plan builds them **before** cloud sync.

## 2. Architecture

```
┌──────────── Electron app (one Windows PC) ────────────┐
│ Screens: Next.js static pages (React)  ← cashier sees │
│            │  safe messages (preload / IPC)           │
│ Main process (Node):                                  │
│   • SQLite file = all data   • business rules         │
│   • login + roles + audit    • printing, PDF, Excel   │
│   • backups                  • background sync engine │
└───────────────────────────┬───────────────────────────┘
                            │ only when internet exists
              Supabase (cloud Postgres + Auth + Storage)
```

- The screens talk **only to the local database** through a safe bridge. They never wait for internet.
- All business logic lives in one shared `domain` module (used by the app and by unit tests). The screen never re-implements a rule.
- The sync engine runs in the background, pushes local changes up and pulls other changes down.
- Suggested single-package layout (not a monorepo): `electron/` (main + preload), `app/` (Next.js pages), `components/`, `domain/` (rules + Zod schemas), `db/` (schema, migrations, queries), `supabase/` (cloud migrations + RLS), `scripts/` (import tools), `docs/`.
- Static export means no Next.js API routes or Server Actions. Every data call goes through IPC.

## 3. Recommended stack (confirm each with the user in Phase 0)

| Area | Recommendation | Why |
| --- | --- | --- |
| UI | Next.js (App Router) + React + TypeScript, static export (`output: 'export'`) loaded inside Electron | No server needed inside the app; a web version stays possible later |
| Look and feel | Tailwind CSS + shadcn/ui + Lucide icons | Accessible, clean, easy to make big and friendly |
| Forms | React Hook Form + Zod | Same validation on screen and in the main process |
| Lists | TanStack Table + TanStack Query (calling IPC) | Fast tables, simple caching |
| Desktop shell | Electron + electron-builder (Windows installer) | Standard, installer and auto-update available |
| Local DB | SQLite via better-sqlite3, main process only, WAL mode | One file, offline, fast, easy to back up |
| DB access | Drizzle ORM (SQLite) with SQL migrations; Supabase CLI migrations for cloud | Typed queries, explicit schema history |
| Cloud | Supabase: Postgres + Auth + Storage, RLS on every table | Owner's choice |
| Sync | Own outbox + pull sync in the main process (Phase 13) | Data is small and there are 1–3 PCs; re-evaluate a managed sync tool if counters grow |
| Printing | HTML/CSS templates printed by Electron (A4 and 80 mm) plus `printToPDF` | Urdu prints correctly and works with any Windows printer driver; ESC/POS only as a fallback |
| Excel | ExcelJS | Real dates and numbers; text columns keep leading zeros |
| Passwords | Node `crypto.scrypt` (no native module) or argon2 | Hashed, works offline |
| Fonts | Bundled locally: Inter (UI) + Noto Nastaliq Urdu or Noto Naskh Arabic | Works offline, no CDN |
| Tests | Vitest (rules) + Playwright (Electron end-to-end) | Rules are the risky part |
| Tooling | pnpm, TypeScript strict, ESLint, Prettier, git, electron-log |  |

The agent must still check current versions and docs before installing anything, and ask the user.

## 4. Data model and sync rules

**Rules for every table (so cloud sync works later):**

- `id` is a **UUID generated on the device**. Never use auto-increment as the primary key.
- Human numbers (`booking_no`, `detail_no`) are separate columns that users see.
- Every row has `shop_id`, `created_at`, `updated_at`, `deleted_at` (soft delete), `created_by`, `updated_by`, `device_id`.
- **Never hard-delete.** 'Delete' sets `deleted_at`. Deleting a booking also soft-deletes its items and payments.
- Dates are `YYYY-MM-DD` text (no time zones). Timestamps are UTC ISO.
- Money is an integer number of rupees.
- Phone and CNIC are **text**.
- **Calculated values** (line total, grand total, paid, remaining, month, total returning days) are never typed by a user and never trusted from sync. Compute them from the source rows.
- Payments are **append-only**: a correction is a void plus a new row.

| Table | Main fields | Notes |
| --- | --- | --- |
| users | name, role (owner / cashier / viewer), password\_hash, active | Local login; disable, never delete |
| customers | name, contact\_1, contact\_2, cnic, address, city\_id, cast\_id, relation\_type\_id, relative\_name, relative\_contact, relative\_cnic, cnic\_scan\_path (optional) | One customer reused in many bookings. Relative fields live here unless the owner wants them per booking |
| cities, casts, relation\_types, dress\_categories | name | Learning dropdown lists, unique ignoring case |
| dresses | code, name, size, category\_id, rate, photo\_path, active | Chosen from a list; deactivate, never delete |
| bookings | booking\_no (unique), customer\_id, status (None / Open / Closed / Pending, default None), booking\_date, delivery\_date, returning\_date, notes, delivered\_on, returned\_on, return\_condition, security\_deposit, discount (only if the owner gives discounts) | Calculated: month, total\_returning\_days, grand\_total, paid, remaining |
| booking\_items | booking\_id, line\_no, detail\_no (= booking\_no × 100 + line\_no), dress\_id, dress\_name\_snapshot, size, quantity, rate, description, jewellery, clutch\_purse, hand\_bag, double\_dupatta, shoes | Calculated: line\_total. The name snapshot keeps old receipts correct if a dress is renamed |
| payments | booking\_id, paid\_on, amount, method (cash / bank / wallet), received\_by, note, kind (rental / deposit / deposit\_refund), voided\_at, void\_reason | Append-only. The first rental payment is the Advance |
| settings | key, value | Shop name, address, phones, logo, receipt footer, clash mode, buffer days, backup folders, printers |
| audit\_log | user\_id, action, table\_name, record\_id, summary, changes (JSON), at | Every create, edit, delete and override |
| sync\_outbox, sync\_state | local only | Phase 13 |

## 5. Business rules (implement once in `domain/`, test all)

1. **Booking ID** (`booking_no`) is automatic and continues after the highest existing number (after import: 412, 413, …).
2. **Detail ID** = booking\_no × 100 + line\_no (booking 47, line 1 → 4701). Imported rows keep their old Detail IDs. Maximum 99 lines per booking, with a friendly message at the limit.
3. **Delivery date first:** a dress cannot be added until the delivery date is filled. Show a friendly prompt that jumps to that field. (The clash check needs it.)
4. **Line total** = quantity × rate. **Grand total** = sum of line totals (minus discount if the owner uses one). It updates live, with no Calculate button.
5. **Month** comes from the booking date. **Total returning days** = absolute difference between returning date and delivery date. Both are read-only.
6. **Remaining** = grand total − sum of valid rental payments. Always calculated, never typed.
7. **Status** values: None (default), Open, Closed, Pending. **Closed** means delivered + returned + fully paid.
8. **Clash check:** the same dress in another booking that is not Closed and not deleted, where the dates overlap, gives a warning naming that booking. The cashier may continue after confirming. The override is written to the audit log. The overlap mode is a setting, confirmed with the owner: same delivery date only, or full delivery-to-return range plus buffer days (default suggestion: range + 1 buffer day for dry-cleaning). A booking without a returning date counts as occupying its delivery date only.
9. **Closed bookings** are ignored by the clash check and by the dress-report highlight.
10. A **receipt** can only be printed for a saved booking.
11. **Nothing is mandatory** except what a rule truly needs (rule 3). CNIC format `00000-0000000-0` is checked only when something is typed. Phone numbers are never rejected for format, only hinted.
12. **Learning dropdowns:** city, cast, relation type, dress category and dress name can be typed and are added to the list instantly. Duplicates are caught ignoring case, spaces and punctuation.
13. **Roles:** Owner = everything (delete, price change, profit and money reports, users, backup and restore). Cashier = create and edit bookings, take payments, print, mark delivered and returned; cannot delete or see profit reports. Viewer = search and view only. Enforced in the main process, not only by hiding buttons.
14. **Audit:** every create, edit, delete, void and clash override records user, time, record and what changed.
15. **Search and save** use parameterised queries only. Apostrophes, quotes, `%`, `_` and Urdu text must never cause an error.
16. **Filters are never hidden.** Active filters are always visible as chips with a Clear All button. Reports use the same filter component as Search. Nothing is saved inside a report.
17. **Excel export** exists on every list and report.
18. **Urdu** is accepted in names, addresses and notes, and displays and prints correctly. Search normalises Urdu letter variants (for example Arabic and Urdu forms of Yeh and Kaf).

## 6. UX / UI rules (the cashier has never used business software)

**Principles**

- **Home = Today.** The first screen shows four big buttons (New Booking, Search, Today's Deliveries, Print Daily Reports) and four counters (deliveries today, returns due, overdue returns, pending payments). Counters are clickable.
- **The booking screen is one page, top to bottom, in the owner's own order:** Booking → Customer → Dresses → Payment, as numbered cards. A sticky bottom bar always shows **Grand total · Paid · Remaining** and the buttons **Save** and **Save & Print**.
- **Plain words only:** Delivery date, Return date, Advance paid, Remaining. Never show: record, entity, sync, conflict, constraint, null, error codes.
- **Big and clear:** base font 16 px or more, click targets 44 px or more, high contrast, labels above fields (never placeholder-only), icons together with text.
- **Status never by colour alone:** a chip is colour + icon + word.
- **Dropdowns:** type to search. If nothing matches, show 'Add "xyz"' on the same line. No pop-up prompts.
- **Do not block saving.** Prefer a gentle yellow hint over a red wall, and always say what to do next.
- **Safe by design:** drafts auto-saved, warning before leaving unsaved changes, soft delete with a 10-second Undo toast, destructive buttons named by their action ('Yes, delete booking' / 'No, keep it').
- **Dates:** DD-MM-YYYY, a date picker that also accepts typing, showing the weekday and 'in 3 days'.
- **Keyboard:** Ctrl+S save, Ctrl+N new booking, Ctrl+F search, Ctrl+P print, Esc close; Tab and Enter follow the owner's field order. Shortcuts appear in tooltips.
- **Always-visible state badge:** 'Saved on this computer ✓' / 'Syncing…' / 'Offline — your work is safe' / 'Needs a look'.
- **Empty states teach:** every empty list explains itself and offers the next button.
- **First-run tour:** 3 short steps, skippable, reopen from Help.
- **Urdu:** auto text direction in inputs, proper font for display and print; UI labels in simple English.

**Screen checklist (a screen is done only when all pass):**

- A new person can do the main task without asking anyone.
- No technical words anywhere.
- Works with keyboard only and at 125% zoom.
- Friendly error and empty states.
- Works with no internet.
- Still fast with 5,000 bookings.
- Urdu text works.
- Role rules are enforced.

## 7. Phase plan

Every phase has: **Goal**, **Ask the user first**, **Tasks**, **Done when**. At the end of each phase the agent updates `docs/PROGRESS.md`, gives a short summary and a manual test checklist, and **waits for the user to say 'Phase N done'**.

Milestones: after Phase 10 the shop can run its daily work offline. Phase 11 brings in the old Access history. Phase 13 adds the cloud.

### Phase 0 — Decisions and project setup

**Goal:** agree every open decision with the user and create a clean, running project skeleton.

**Ask the user first (one question at a time, with your recommendation):**

1. Desktop only for now (recommended) or also a web version later?
2. How many PCs / counters will use it at the same time? Is internet in the shop reliable?
3. Which printers: A4, 80 mm thermal, or both? Model names. Which Windows version is on the shop PC?
4. Clash rule: same delivery date only (as in Access) or the whole delivery-to-return range plus buffer days? Recommendation: range + 1 buffer day, as a setting.
5. Is a security deposit taken? Is a rental discount ever given?
6. May a cashier change a line's rate, or only the owner?
7. The owner wants no mandatory fields. Confirm the only exception: delivery date before adding a dress.
8. Should a CNIC scan or photo be attached to a customer? (Private data: stays in a private folder and a private cloud bucket.)
9. Keep the Cast field? The owner plans to send a cast list, so recommendation: keep, optional.
10. Shop name, address, phone numbers, logo and receipt footer text (return rules, damage policy).
11. App name and icon, data folder, backup folder.
12. Login style: password or short PIN, and auto-logout after how many idle minutes.
13. Who creates the Supabase account and project, and which region.

**Tasks**

1. Create the git repo. Create `docs/PROGRESS.md` (every phase from this plan as a checklist with date and notes), `docs/DECISIONS.md` (each decision, answer, date) and `docs/source/` (copy the requirements file and the 5 transcripts). Add `.env*` and `docs/source-data/` to `.gitignore`.
2. Walk through the questions above. Record every answer in DECISIONS.md.
3. Install tooling (Node LTS, pnpm). Create the Next.js app (TypeScript strict, App Router, Tailwind) with `output: 'export'`. Add Electron, electron-builder, ESLint, Prettier and Vitest.
4. Hello-world check: an Electron window opens the Next.js page. `pnpm dev` and `pnpm build` both work. One sample unit test passes.
5. Write a short `README` with the commands to run, build and test.

**Done when:** DECISIONS.md is filled, the empty app opens in an Electron window, tests run, and PROGRESS.md exists.

### Phase 1 — App shell, local database, design system

**Goal:** a secure Electron shell, a migrating SQLite database with the full sync-ready schema, and the reusable UI kit.

**Ask the user first:** confirm the stack table in section 3 (Drizzle vs plain SQL files, shadcn/ui, fonts) and the colour and logo direction for the app.

**Tasks**

1. Electron security: `contextIsolation` on, `nodeIntegration` off, sandbox on, strict CSP, block navigation and new windows, allow only the preload bridge.
2. Typed IPC layer: `window.api.<module>.<action>()`. Inputs validated with Zod in the main process. Failures return a friendly message object, never a raw error.
3. SQLite in the user-data folder: WAL mode, foreign keys on, a migration runner with a `schema_version` table, and migration 001 that creates **all** tables from section 4 with the sync columns. Add indexes on booking\_no, delivery\_date, returning\_date, status, customer name, phone, CNIC and dress name.
4. Design system: Tailwind tokens, bundled fonts (UI font + Urdu font), and components: Button, Input, learning Combobox, DatePicker, Dialog, Toast with Undo, Table, status Chip, Stepper (+/−), Card, Sidebar, TopBar.
5. App layout: left menu (Home, New Booking, Bookings, Customers, Dresses, Reports, Settings), top bar with the global search box and the state badge (placeholder 'Saved on this computer ✓').
6. Home screen skeleton with the four big buttons and four counters (static for now).
7. Global error boundary, friendly error toast and a log file (electron-log).
8. A hidden 'UI kit' page showing every component, with Urdu sample text.

**Done when:** the app starts with no internet, creates its database, migrations run twice without harm, the UI kit page renders everything including Urdu, and typecheck, lint and tests pass.

### Phase 2 — Login, roles and audit log

**Goal:** every action is done by a known user with the right permission and is logged.

**Ask the user first:** password vs PIN, idle auto-logout minutes, owner's name (confirm Phase 0 answers).

**Tasks**

1. First-run wizard: create the Owner account and enter shop details (name, address, phones, logo). Stored in `settings`.
2. Login screen: big, simple, remembers the last user name. Passwords hashed with scrypt. Delay after repeated wrong attempts. Idle auto-logout.
3. Role matrix from rule 13 enforced by one `requireRole()` helper that **every** IPC handler calls. The UI hides forbidden buttons, but the main process is the real guard.
4. User management (Owner only): add user, change role, reset password, disable. No hard delete.
5. Audit service: all writes go through one `withAudit()` wrapper that stores user, action, table, record id, time and changed fields. Owner-only audit viewer with filters.
6. Session handling: current user shown in the top bar, 'Switch user' without closing the app.

**Done when:** tests prove a Cashier cannot delete or open profit reports, a Viewer cannot change anything, and every write creates an audit row.

### Phase 3 — Lists, customers, dress catalogue

**Goal:** the master data that bookings depend on, entered the way the owner described.

**Ask the user first:** the cast list (the owner said he will send it), the relation types to pre-load, the dress categories, whether the CNIC scan field is wanted (Phase 0 answer).

**Tasks**

1. **Learning dropdown** component and API for city, cast, relation type and dress category: type, and if there is no match show 'Add "xyz"' and save instantly. Ignore case, spaces and punctuation when checking duplicates. Owner can rename, merge or disable entries in Settings.
2. Seed lists: the owner's cast list, plus relation types such as Wife, Husband, Son, Daughter, Father, Mother, Brother, Sister, Chacha, Taya, Mama, Phuphi, Khala (the owner confirms the list).
3. **Customers** screen: list with search, and a form laid out like the owner described, as full lines: Row 1 customer (Name, Phone 1, Phone 2, CNIC). Row 2 relative (Relation, Name, Phone, CNIC). Row 3 City, Cast, Address. Phone saved as text; CNIC mask `00000-0000000-0`, checked only when typed; Urdu accepted everywhere; optional CNIC scan attach if confirmed.
4. Duplicate guard: same name + phone shows 'This customer already exists. Use them?' rather than creating a copy.
5. Customer detail page with a list of that customer's bookings (filled in Phase 4).
6. **Dress catalogue:** list with photo thumbnail, code, name, size, category, rate and active flag. Create and edit form. Photo optional (copied into the app folder, thumbnail made). Deactivate instead of delete. Only the Owner can change rates.
7. Similar-name suggestions when adding a dress ('Did you mean Red Bridal Lehenga?') using normalised matching.
8. A quick-add dress dialog (name only is enough) reusable from the booking screen.

**Done when:** a new city, cast, relation and dress can be added by typing once; a duplicate is caught; Urdu names save and show; phone numbers keep their leading zero.

### Phase 4 — The booking screen (core)

**Goal:** a cashier can create a 3-dress booking quickly. This screen decides whether the app is loved or hated. Spend the effort here.

**Ask the user first:** field order and labels (show a quick sketch), whether the cashier edits line rates, and which accessory labels the owner wants (default: Jewellery, Clutch purse, Hand bag, Double dupatta, Shoes).

**Tasks**

1. **Booking card:** Booking No (automatic, shown large), Status (default None, coloured chips), City, Booking date (default today), Delivery date, Returning date, Month and Total days (read-only, automatic), Notes.
2. **Customer card:** search-as-you-type for an existing customer by name, phone or CNIC, or 'New customer' inline using the same form component as Phase 3. Relative fields shown directly below.
3. **Dresses card:** one row per dress. Dress picker is the learning dropdown (catalogue plus quick-add). Size and Rate prefill from the catalogue and stay editable (per the Phase 0 answer). Quantity defaults to 1. Description is a condition note. Accessories are small +/− steppers with icons. Line total is automatic. A big 'Add another dress' button and a remove button per line.
4. **Rule 3:** if the delivery date is empty when someone tries to add a dress, show a friendly prompt and jump to that field.
5. **Sticky bar:** Grand total, Paid, Remaining (live) with Save, Save & Print (print wired in Phase 8) and New booking.
6. **Save** runs in one transaction (booking, items, audit). **Drafts** are auto-saved locally every few seconds and offered again after a crash or restart. **Undo** reverts to the last saved version. **Duplicate** creates a new draft from an existing booking (new number, dates empty, payments not copied). **Delete** is Owner-only, soft, with an Undo toast.
7. Editing an existing booking uses the same screen and shows 'Last edited by X, time'.
8. Keyboard: Ctrl+S, Ctrl+N, Ctrl+P, Esc, Tab/Enter in the owner's order.
9. Unit tests for line total, grand total, month, total returning days and Detail ID generation before wiring the UI.

**Done when:** a tester who has never seen the app creates a 3-dress booking in about two minutes without help, totals and IDs are right, a crash does not lose the draft, and the screen passes the section 6 checklist.

### Phase 5 — Payments, remaining, status

**Goal:** money is always right and nobody types a Remaining amount again.

**Ask the user first:** may a Cashier void a payment (recommendation: Owner only), payment methods list (default cash, bank, wallet), the deposit and discount answers from Phase 0.

**Tasks**

1. **Payment card** on the booking screen: first row is the **Advance** (amount, method, received by = current user, date). 'Add payment' later, with the amount defaulting to the remaining balance.
2. Payments are append-only. A mistake is voided with a reason and a new row is added. Everything is audited.
3. **Remaining** = grand total − valid rental payments, always calculated. Show 'Fully paid' in green or 'Remaining Rs X' in orange. Warn on overpayment.
4. **Security deposit** (only if the owner uses it): recorded as a deposit payment, refunded on return, never counted in Remaining.
5. **Discount** (only if the owner uses it): a booking-level amount; grand total = lines − discount.
6. **Status:** None, Open, Pending, Closed with plain tooltips. To set Closed the booking must be delivered, returned and fully paid. If not, show exactly what is missing as a checklist. The Owner may force-close with a reason. When all conditions are met, offer 'Close this booking?'.
7. Tests: zero advance, several payments, a voided payment, overpayment, deposit, discount.

**Done when:** acceptance criterion 1 passes without any hand calculation, and the tests above are green.

### Phase 6 — Availability and clash warnings

**Goal:** the same dress is never double-booked by accident.

**Ask the user first:** confirm the clash mode and buffer days from Phase 0.

**Tasks**

1. A pure `findClashes(dress, delivery, returning, excludeBookingId)` function in `domain/`. It ignores Closed and deleted bookings and the booking being edited, and handles an empty returning date.
2. **Warning dialog** when a dress is added and again when dates change: 'Dress "X" is already booked in Booking #123 (customer, dates). \[No, choose another dress\] \[Yes, continue anyway\]'. The override is audited and the line gets a small 'double-booked' badge.
3. **Hints inside the dress dropdown:** each dress shows 'Available' or 'Booked on these dates', so people avoid the clash before choosing.
4. **Availability screen:** pick a date (or a range) and see free dresses with photo, name and size. A per-dress month calendar shows booked ranges; clicking one opens that booking.
5. Index tuning and a performance test with generated data (5,000 bookings).

**Done when:** acceptance criterion 2 passes, tests cover overlap, Closed ignored, same booking excluded, empty returning date, and the check stays fast with 5,000 bookings.

### Phase 7 — Search and filters

**Goal:** the owner can find anything instantly.

**Tasks**

1. **Global search box** (always visible, Ctrl+F) over booking number, customer name, relative name, both phone numbers, CNIC (with or without dashes), city, cast and dress name. Parameterised queries only. Normalise case, spaces and Urdu letter variants.
2. **Results list:** large rows with booking no, customer, phone, dates, a short dress summary, status chip and remaining. Click opens the booking.
3. **Filters:** status, month, date range with a choice of booking / delivery / returning date, city, cast, and a specific field. Active filters show as removable chips with a result count and a **Clear All** button. Filters are never saved inside a screen or report.
4. Tests with apostrophes, quotes, `%`, `_`, emoji and Urdu text.
5. Add the Excel export button here (it is wired in Phase 10).

**Done when:** acceptance criterion 3 passes, and results come back well under 2 seconds with 5,000 bookings (target under 300 ms).

### Phase 8 — Receipts and printing

**Goal:** a clean receipt on the shop's real printer, in Urdu and English.

**Ask the user first:** printer(s) and paper (A4, 80 mm, both), shop header and logo, footer terms, whether reprints should say 'COPY'.

**Tasks**

1. Receipt template in HTML/CSS: shop name and logo, booking no, customer, phone, CNIC, booking / delivery / returning dates, each dress line with size, quantity, rate, line total and accessory counts, grand total, payments received, remaining. Urdu notes render correctly.
2. Two layouts: **A4** and **80 mm thermal** (`@page` size, narrow layout, larger type). Fonts are bundled so printing works offline.
3. Print preview dialog: layout, copies, printer (remembered per layout) and **Save as PDF** (`printToPDF`).
4. Rule 10: the receipt button is disabled with a tooltip 'Save the booking first' until the booking is saved.
5. Reprint from the booking list and from search results.
6. Handle long dress lists with sensible page breaks.
7. Wire up **Save & Print** on the booking screen.

**Done when:** the owner prints a real sample on the shop printer and approves it, including a booking with Urdu text and 6+ dress lines.

### Phase 9 — Delivery and return tracking

**Goal:** always know which dresses are out, which are late and what condition they came back in.

**Ask the user first:** whether a per-dress 'ready / prepared' tick is wanted for the night-before preparation, and the condition choices (default: OK, Needs cleaning, Damaged).

**Tasks**

1. **Mark delivered** (date default today, note) and **Mark returned** (date, condition, damage note, optional photo). Cashier and Owner can do both. All audited.
2. Delivered and Returned badges on lists and on the booking screen.
3. **Overdue returns:** delivered, not returned, returning date passed, showing days late.
4. Return flow prompts: refund deposit (if used), take the remaining payment, offer to close the booking.
5. Optional per-line 'Ready' tick (if the owner wants it).
6. Make the Home counters real: deliveries today, returns due, overdue, pending payments. Each is clickable.

**Done when:** a booking can go through booked → delivered → returned → paid → closed and the Closed rule is enforced.

### Phase 10 — Reports and exports

**Goal:** the daily printed reports the owner asked for, plus the reports from the requirements file, all exportable.

**Ask the user first:** which exact 3 reports are printed every day (see 'Daily Pack' below), and which reports Cashier may see. Recommendation: money and profit reports are Owner-only.

**Tasks**

1. **Report framework:** one Reports screen with a list of reports on the left, the same filter bar as Search on top (chips, Clear All), a preview table, and the buttons **Print**, **PDF** and **Excel**. Footer totals and counts on every report.
2. **Daily operations reports (from the voice notes):**
   - **Delivery Sheet:** today, tomorrow, next 2 days or custom. Per booking: customer name, CNIC, phone, relative, dresses with size, accessories and condition notes, remaining amount due.
   - **Prepare and Dry-Clean List:** dresses leaving in the next 2 days and dresses coming back that need cleaning, with a tick box per line.
   - **Returns Due and Overdue.**
   - **Customer Report** (replaces BDRCustomer): booking no, dates, customer, phone, CNIC, city, month, status (open/closed), dress names, grand total, advance / paid, remaining. Footer: money totals and booking count.
   - **Customers This Month:** number of bookings and unique customers, by city, with the list.
   - **Today's Open Accounts:** Open bookings whose dresses go out today.
   - **Daily Pack:** one button that prints the 3 reports the owner chooses.
3. **Reports from the requirements file:** Only-Customer report (city, month, total days, customer, relation, status), **Dress report** (each booking's dress lines with accessories, highlighting a dress booked in another non-Closed booking on the same delivery date), Daily cash by method (Owner), Outstanding balances (oldest delivery first), Overdue returns.
4. **Excel export** with ExcelJS: real numbers and dates; phone and CNIC as text so zeros stay; Urdu works; frozen header row; totals row. Available on every list and report (Bookings, Customers, Dresses, Payments).
5. **'Export everything to Excel'** in Settings (Owner): one workbook with bookings, items, payments, customers and dresses. This is the emergency fallback when the system or internet is down.
6. Optional: every day automatically save an Excel file of the next 7 days' deliveries into the backup folder, so work can continue on any PC.
7. Tests: report totals equal the booking screen totals; filters match Search results.

**Done when:** the owner receives printed samples of the daily reports, an exported Excel opens correctly with leading zeros intact, and report totals match the booking totals.

### Phase 11 — Data migration from Access

**Goal:** bring all history across safely, with proof it is correct.

**Ask the user first:** how to get the data (the user exports `Bookings` and `Booking Details` from Access to CSV or Excel in UTF-8, or provides the `.accdb`), the phone format to restore (for example `03xx-xxxxxxx`), and how Open / Close map to the new statuses (recommendation: Open → Open, Close → Closed, blank → None).

**Tasks**

1. `scripts/import-access`: runs as a **dry run by default**, then a real run. It is idempotent (re-running does not create duplicates), uses one transaction and never touches data that was not imported.
2. Parse and clean: trim text, normalise Urdu letter variants, parse dates, report anything unreadable.
3. **Customers:** pull customer fields out of each booking and merge customers with the same name and phone. Show a 'possible duplicates' list for the owner to review.
4. **Phone and CNIC:** convert from numbers to text, restore lost leading zeros with the format the owner confirmed, format CNIC as `00000-0000000-0` where there are 13 digits, and list the rows that cannot be fixed automatically.
5. **Dress names:** build the list of distinct names, group likely spelling variants, and show a review screen for the owner to merge duplicates, fix spellings and set the rate **before** import.
6. Import bookings keeping their old Booking IDs (47–411) and booking items keeping their old Detail IDs.
7. Create one **payment** per booking from its Advance Amount, dated on the booking date (skip zero advances).
8. **Do not import Remaining Amount** (243 old rows differ from total − advance). Recalculate Month from the booking date and log rows where the old Month differs.
9. **Reconciliation report** with PASS or FAIL: bookings imported (expect 359), lines imported (expect 368), sum of grand totals (expect 789,801), customers created and merged, failed rows with reasons, and the list of old Remaining mismatches for information.
10. Keep the raw source files in `docs/source-data/` (git-ignored). Customer data is private.

**Done when:** acceptance criterion 4 passes (359 / 368 / 789,801), failed rows are zero or explained, and the owner has reviewed the dress list and duplicate customers.

### Phase 12 — Backup and restore

**Goal:** the shop cannot lose its data.

**Ask the user first:** backup folder, an optional second location (USB drive or a synced folder), and how many days of backups to keep (recommendation: 30 daily + monthly).

**Tasks**

1. **Automatic daily backup** using the SQLite backup API or `VACUUM INTO`: when the app starts if none has run today, at a set time while open, and on close. Run `PRAGMA integrity_check` on each backup.
2. Home shows 'Last backup: today 9:41 PM ✓'. If there has been no backup for 2 days, show a friendly warning.
3. Include the photos folder in the backup (zip).
4. **Owner-only one-click restore:** a list of backups with date and a summary (for example '412 bookings'). Plain-language confirmation. The app first makes a 'before restore' backup, then restores and restarts.
5. Test: corrupted database, restoring onto a fresh PC, restoring an older backup.

**Done when:** a backup is made automatically, a deliberately damaged database is restored in a few clicks, and the owner has tried the restore screen.

### Phase 13 — Supabase cloud and offline sync

**Goal:** data is copied to the cloud and other PCs, while the shop keeps working with no internet.

**Ask the user first (agent explains in plain words):**

- One PC or several? (If one, this phase is mostly cloud backup and restore, which is much simpler.)
- Custom sync (recommended for 1–3 PCs) or a managed sync tool? The agent briefly compares cost, effort and current Electron support, then recommends.
- **Booking number plan for several PCs:** each PC gets its own number block, or numbers are finalised when they reach the cloud. With one PC the local counter is enough.
- The user creates the Supabase project. The agent guides: region closest to the shop, plan limits and backup features checked on the current Supabase pages. Only the URL and anon key go into `.env.local`.
- How the app signs in to the cloud: recommendation is one 'shop sync account' (email + password) stored with Electron `safeStorage`, separate from staff logins, so staff can still log in offline.

**Tasks**

1. `supabase/` folder with SQL migrations mirroring the SQLite schema, plus `server_updated_at` (default now, set by trigger). **Row Level Security on every table:** only authenticated users belonging to the shop (`shop_id`) can read or write. Private storage buckets for dress photos and CNIC scans using signed URLs.
2. **Outbox:** every local write adds a row to `sync_outbox` inside the same transaction.
3. **Push:** background batches, parents before children (customers, dresses, bookings, items, payments), idempotent upserts, retry with backoff, mark synced.
4. **Pull:** for each table fetch rows with `server_updated_at` after the saved cursor and apply them. Header rows use last-write-wins. Booking items and payments are separate rows, so two PCs adding lines or payments merge naturally. Soft deletes travel too. After a merge, recalculate totals.
5. **Clash after merge:** if two PCs booked the same dress for overlapping dates while offline, mark both bookings 'Needs a look' and show a Home notice.
6. Photo and scan upload and download queues, loaded lazily.
7. Initial sync for a new or restored PC. Sync of the users table (hashes) so staff can log in on another PC while offline. Owner only.
8. **State badge:** 'Saved and synced ✓' / 'Syncing…' / 'Offline — your work is safe (N changes waiting)' / 'Needs a look'. A 'Sync now' button and last-sync time in Settings. No technical wording.
9. Guard against clock mistakes: use the server time for sync cursors and reject device times far in the future.
10. Scenario tests: offline for 2 days on two instances and then reconnect, app killed mid-sync, the same batch pushed twice, a deleted booking edited elsewhere.

**Done when:** two app instances converge to the same data after offline work, nothing is lost or duplicated in the scenario tests, and the shop can keep working with the network switched off.

### Phase 14 — Hardening, performance and real-user testing

**Goal:** find problems before the owner does.

**Tasks**

1. **Performance:** load 5,000+ bookings. Search under 2 seconds (target under 300 ms), report generation, app start time.
2. **Security review:** every IPC handler has input validation and a role check (test matrix), a search of the codebase for string-built SQL, CSP and Electron settings check, secrets scan, no `service_role` key anywhere.
3. **Role tests:** acceptance criterion 5 as automated tests.
4. **Usability test** with 1–2 real staff. Five tasks: create a 3-dress booking with advance and print; find a booking by phone number; find a customer with an apostrophe in the name; mark a booking returned; print the daily pack. Fix every place where they hesitate for more than 10 seconds. Record the findings.
5. **Accessibility basics:** contrast, visible focus, 125% font scale, keyboard-only use.
6. **Urdu check** across input, search, display, print, PDF and Excel.
7. **Error-state review:** no technical messages anywhere; every error says what happened and what to do.
8. **Edge cases:** very long notes, 99+ lines, negative amounts, date changes after payments, duplicate rapid clicks on Save.

**Done when:** all tests are green, the usability test findings are fixed, and the performance targets are met with 5,000 bookings.

### Phase 15 — Packaging, handover and go-live

**Goal:** installed on the shop PC, documented, signed off.

**Ask the user first:** app name and icon, code signing (explain that without it Windows SmartScreen shows a warning on install), auto-update yes or no, and where releases are hosted.

**Tasks**

1. **Windows installer** with electron-builder (per-user install if possible). The database lives in the user-data folder, **never** in the install folder, so updates cannot touch data.
2. Optional auto-update (electron-updater). Migrations run automatically and a backup is made before every update.
3. Test on a clean Windows PC like the shop's, including the printer and offline mode.
4. **User guide** in simple English and Roman Urdu with screenshots, a one-page 'daily routine' sheet, and an in-app Help with the first-run tour.
5. **Handover docs:** README (run, build, release), architecture, database schema, runbook (restore, sync trouble, new PC set-up), `.env.example`, and a list of accounts and keys with who holds them.
6. **Go-live plan:** run in parallel with Access for an agreed number of days. At cut-over: freeze Access, export, import, check reconciliation, then switch.
7. **UAT with the owner** against Appendix A. Sign-off.

**Done when:** the owner signs off and the shop is using the app daily.

### Phase 16 — Optional extras (only if the owner asks)

SMS or WhatsApp reminders (delivery and return), dress photos on receipts, a dashboard with monthly income and top dresses, a web view for the owner, barcode or QR labels on dress tags.

## Appendix A — Acceptance criteria

1. A cashier creates a booking with 3 dress lines, takes an advance, prints the receipt and sees the correct remaining amount with no hand calculation.
2. Adding a dress that is already booked on the same delivery date shows a clash warning naming the other booking ID.
3. Searching a name with an apostrophe works.
4. Migration reconciliation matches 359 bookings, 368 lines and the old grand total of 789,801.
5. Each role can do only what the role table allows.
6. The app works with no internet, and Excel export works at any time.
7. A person with no technical background can complete the main tasks without help.

## Appendix B — Prompts the user can paste to the agent

- **Start:** 'Read docs/PLAN.md fully and follow section 0. Start Phase 0. Ask me every config question one at a time.'
- **Phase finished:** 'Phase N is done and I tested it. Update PROGRESS.md and start Phase N+1. Ask me before any config.'
- **Resume in a new chat:** 'Read docs/PLAN.md, docs/PROGRESS.md and docs/DECISIONS.md, tell me in 3 lines where we are, and continue.'
- **Problem found:** 'In Phase N, \<what you saw>. Fix it and add a test before moving on.'
- **Change request:** 'The owner wants \<change>. Tell me which phases it affects and what it costs before you do anything.'

## Appendix C — PROGRESS.md starter

```
# Progress
Current phase: 0
Last updated: <date>

- [ ] Phase 0  Decisions and setup
- [ ] Phase 1  Shell, database, design system
- [ ] Phase 2  Login, roles, audit
- [ ] Phase 3  Lists, customers, dresses
- [ ] Phase 4  Booking screen
- [ ] Phase 5  Payments and status
- [ ] Phase 6  Availability and clash
- [ ] Phase 7  Search and filters
- [ ] Phase 8  Receipts and printing
- [ ] Phase 9  Delivery and return
- [ ] Phase 10 Reports and exports
- [ ] Phase 11 Access migration
- [ ] Phase 12 Backup and restore
- [ ] Phase 13 Cloud and sync
- [ ] Phase 14 Hardening and testing
- [ ] Phase 15 Packaging and go-live

## Known issues
## Next step
```
