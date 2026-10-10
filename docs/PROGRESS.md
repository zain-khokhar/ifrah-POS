# Progress
Current phase: 4
Last updated: 2026-10-10

- [x] Phase 0  Decisions and setup
- [x] Phase 1  Shell, database, design system
- [x] Phase 2  Login, roles, audit
- [x] Phase 3  Lists, customers, dresses
- [x] Phase 4  Booking screen
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

## Verification & Tests
- `npm test`: **72 / 72 unit tests passed** (including Phase 2 auth/audit, Phase 3 customers/dresses/lists, and Phase 4 booking calculation and business logic suites).
- `npm run lint`: **0 errors, 0 warnings** (Clean ESLint check across all dashboard pages).
- `npm run build`: **Compiled & exported successfully** across all 17 static routes.
