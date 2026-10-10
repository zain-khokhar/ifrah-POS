/**
 * electron/database/schema.js
 *
 * All CREATE TABLE statements for the Ifrah Collection POS.
 * Each table follows the same base pattern:
 *   - id            INTEGER PRIMARY KEY AUTOINCREMENT  (local SQLite ID)
 *   - sync_id       TEXT UNIQUE                        (UUID, used for Supabase sync)
 *   - created_at    TEXT                               (ISO 8601 UTC)
 *   - updated_at    TEXT                               (ISO 8601 UTC)
 *   - deleted_at    TEXT DEFAULT NULL                  (soft delete — NULL = active)
 *   - sync_status   TEXT DEFAULT 'local'               ('local' | 'synced' | 'conflict')
 *   - last_synced_at TEXT DEFAULT NULL
 *
 * Tables:
 *  1. users           — App users (owner / cashier / viewer)
 *  2. customers       — Dress rental customers
 *  3. cities          — City/area reference list
 *  4. casts           — Customer social groups / biradari
 *  5. dresses         — Dress inventory items
 *  6. bookings        — Rental booking records
 *  7. booking_items   — Dresses in a booking (one booking → many dresses)
 *  8. payments        — Payment records (append-only)
 *  9. audit_logs      — Who did what and when (immutable)
 * 10. sync_outbox     — Pending changes to push to Supabase (Phase 11)
 * 11. sync_conflicts  — Conflicts during sync that need resolution (Phase 11)
 */

const SCHEMA_STATEMENTS = [
  // ──────────────────────────────────────────────────────────────────────────
  // 1. USERS
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    full_name       TEXT    NOT NULL,
    role            TEXT    NOT NULL CHECK(role IN ('owner', 'cashier', 'viewer')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CITIES
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL UNIQUE,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CASTS (Biradari / Social Group)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS casts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL UNIQUE,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CUSTOMERS
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL,
    phone           TEXT,
    phone2          TEXT,
    address         TEXT,
    city_id         INTEGER REFERENCES cities(id),
    cast_id         INTEGER REFERENCES casts(id),
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 5. DRESSES
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS dresses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    code            TEXT    NOT NULL UNIQUE,          -- Dress catalog code e.g. "D-001"
    name            TEXT    NOT NULL,
    description     TEXT,
    category        TEXT,                             -- e.g. "Lehenga", "Saree", "Sharara"
    color           TEXT,
    size            TEXT,
    rental_price    REAL    NOT NULL DEFAULT 0,
    security_deposit REAL   NOT NULL DEFAULT 0,
    is_available    INTEGER NOT NULL DEFAULT 1,       -- Quick availability flag
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 6. BOOKINGS
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS bookings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    booking_number  TEXT    NOT NULL UNIQUE,          -- Human-readable ID e.g. "BK-2025-001"
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    city_id         INTEGER REFERENCES cities(id),
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'confirmed', 'delivered', 'returned', 'cancelled')),
    booking_date    TEXT    NOT NULL,                 -- ISO date YYYY-MM-DD
    event_date      TEXT,                             -- Date of the actual event
    delivery_date   TEXT,                             -- Planned delivery date
    return_date     TEXT,                             -- Planned return date
    booking_month   TEXT,                             -- Derived month label e.g. "Jan 2025"

    -- Relative info (the person wearing the dress, may differ from customer)
    relative_name   TEXT,
    relative_relation TEXT,

    -- Pricing (calculated from booking_items, stored here for quick access)
    total_amount    REAL    NOT NULL DEFAULT 0,
    discount        REAL    NOT NULL DEFAULT 0,
    grand_total     REAL    NOT NULL DEFAULT 0,       -- total_amount - discount
    amount_paid     REAL    NOT NULL DEFAULT 0,       -- sum of payments
    remaining       REAL    NOT NULL DEFAULT 0,       -- grand_total - amount_paid

    notes           TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 7. BOOKING_ITEMS (Dresses in a booking)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS booking_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    booking_id      INTEGER NOT NULL REFERENCES bookings(id),
    dress_id        INTEGER NOT NULL REFERENCES dresses(id),
    rental_price    REAL    NOT NULL DEFAULT 0,       -- Price at time of booking (snapshot)
    security_deposit REAL   NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 8. PAYMENTS (Append-only — no edit or delete, only void)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    booking_id      INTEGER NOT NULL REFERENCES bookings(id),
    amount          REAL    NOT NULL,
    payment_method  TEXT    NOT NULL DEFAULT 'cash'
                    CHECK(payment_method IN ('cash', 'easypaisa', 'jazzcash', 'bank_transfer', 'other')),
    payment_type    TEXT    NOT NULL DEFAULT 'advance'
                    CHECK(payment_type IN ('advance', 'partial', 'full', 'security', 'void')),
    reference_no    TEXT,                             -- Bank/JazzCash transaction ref
    note            TEXT,
    received_by     INTEGER REFERENCES users(id),
    payment_date    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    is_void         INTEGER NOT NULL DEFAULT 0,
    void_reason     TEXT,
    voided_by       INTEGER REFERENCES users(id),
    voided_at       TEXT    DEFAULT NULL,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 9. AUDIT_LOGS (Immutable — no delete)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    user_id         INTEGER REFERENCES users(id),
    action          TEXT    NOT NULL,                 -- e.g. 'booking.create', 'payment.void'
    table_name      TEXT,
    record_id       INTEGER,
    old_values      TEXT,                             -- JSON snapshot before change
    new_values      TEXT,                             -- JSON snapshot after change
    ip_address      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 10. SYNC_OUTBOX (Phase 11 — offline changes waiting to sync to Supabase)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT    NOT NULL,
    operation       TEXT    NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_sync_id  TEXT    NOT NULL,
    payload         TEXT    NOT NULL,                 -- JSON of changed data
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'processing', 'done', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 11. SYNC_CONFLICTS (Phase 11 — conflicts that need manual resolution)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT    NOT NULL,
    record_sync_id  TEXT    NOT NULL,
    local_data      TEXT    NOT NULL,                 -- JSON of local version
    remote_data     TEXT    NOT NULL,                 -- JSON of Supabase version
    resolution      TEXT    CHECK(resolution IN ('local', 'remote', 'manual', NULL)),
    resolved_by     INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    resolved_at     TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // INDEXES — for common queries
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_customers_phone   ON customers(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_name    ON customers(name)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings(booking_date)`,
  `CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_booking_items_dress   ON booking_items(dress_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_booking  ON payments(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user   ON audit_logs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_table  ON audit_logs(table_name, record_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status)`,
];

module.exports = { SCHEMA_STATEMENTS };
