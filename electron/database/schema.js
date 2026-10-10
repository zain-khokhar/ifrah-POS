/**
 * electron/database/schema.js
 *
 * All CREATE TABLE and CREATE INDEX statements for Ifrah Collection POS.
 *
 * Design rules (from plans/claude.md §4):
 *  - id  = INTEGER PRIMARY KEY AUTOINCREMENT  (local SQLite row ID)
 *  - sync_id = TEXT UNIQUE  (UUID hex, used for cloud sync later)
 *  - created_at / updated_at = ISO 8601 UTC text
 *  - deleted_at = NULL while active  (soft delete — never hard delete)
 *  - sync_status = 'local' | 'synced' | 'conflict'
 *
 * Tables
 *  1.  users              App users  (owner / cashier / viewer)
 *  2.  cities             Learning dropdown list
 *  3.  casts              Learning dropdown list  (biradari)
 *  4.  relation_types     Learning dropdown list  (wife, husband, …)
 *  5.  dress_categories   Learning dropdown list  (lehenga, saree, …)
 *  6.  customers          Rental customers
 *  7.  dresses            Dress catalogue
 *  8.  bookings           Rental bookings
 *  9.  booking_items      One row per dress per booking
 * 10.  payments           Append-only payment records
 * 11.  audit_logs         Immutable write trail
 * 12.  sync_outbox        Phase 13 — pending cloud push
 * 13.  sync_conflicts     Phase 13 — merge conflicts
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
    role            TEXT    NOT NULL CHECK(role IN ('owner','cashier','viewer')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CITIES  (learning dropdown)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL,
    name_normalized TEXT    NOT NULL UNIQUE,   -- lowercase, stripped for dedup
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CASTS  (biradari / social group — learning dropdown)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS casts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL,
    name_normalized TEXT    NOT NULL UNIQUE,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 4. RELATION_TYPES  (wife, husband, son, … — learning dropdown)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS relation_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL,
    name_normalized TEXT    NOT NULL UNIQUE,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 5. DRESS_CATEGORIES  (lehenga, saree, … — learning dropdown)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS dress_categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL,
    name_normalized TEXT    NOT NULL UNIQUE,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 6. CUSTOMERS
  //    Layout from plan §3 task 3:
  //    Row 1: name, phone, phone2, cnic
  //    Row 2: relative (relation_type_id, relative_name, relative_phone, relative_cnic)
  //    Row 3: city_id, cast_id, address
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS customers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id             TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name                TEXT    NOT NULL,
    phone               TEXT,                            -- stored as text (leading zeros safe)
    phone2              TEXT,
    cnic                TEXT,                            -- format 00000-0000000-0
    relation_type_id    INTEGER REFERENCES relation_types(id),
    relative_name       TEXT,
    relative_phone      TEXT,
    relative_cnic       TEXT,
    city_id             INTEGER REFERENCES cities(id),
    cast_id             INTEGER REFERENCES casts(id),
    address             TEXT,
    notes               TEXT,
    created_by          INTEGER REFERENCES users(id),
    updated_by          INTEGER REFERENCES users(id),
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT    DEFAULT NULL,
    sync_status         TEXT    NOT NULL DEFAULT 'local',
    last_synced_at      TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 7. DRESSES  (dress catalogue)
  //    'active' flag — deactivate, never hard-delete
  //    photo_path — optional, copied into app folder
  //    Only Owner can change rental_price
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS dresses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    code            TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    category_id     INTEGER REFERENCES dress_categories(id),
    size            TEXT,
    rental_price    INTEGER NOT NULL DEFAULT 0,          -- rupees, integer
    description     TEXT,
    photo_path      TEXT,
    active          INTEGER NOT NULL DEFAULT 1,          -- 1 = active, 0 = deactivated
    created_by      INTEGER REFERENCES users(id),
    updated_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT    DEFAULT NULL,
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 8. BOOKINGS
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS bookings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id             TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    booking_no          INTEGER NOT NULL UNIQUE,          -- auto-increment human ID (412, 413…)
    customer_id         INTEGER NOT NULL REFERENCES customers(id),
    city_id             INTEGER REFERENCES cities(id),
    status              TEXT    NOT NULL DEFAULT 'None'
                        CHECK(status IN ('None','Open','Closed','Pending')),
    booking_date        TEXT,                             -- YYYY-MM-DD
    delivery_date       TEXT,
    returning_date      TEXT,
    booking_month       TEXT,                             -- derived from booking_date
    total_returning_days INTEGER,                         -- |returning_date - delivery_date|
    relative_name       TEXT,
    relative_relation   TEXT,
    notes               TEXT,
    delivered_on        TEXT,
    delivery_note       TEXT,
    returned_on         TEXT,
    return_condition    TEXT,
    return_damage_note  TEXT,
    return_damage_photo TEXT,
    security_deposit    INTEGER NOT NULL DEFAULT 0,
    discount            INTEGER NOT NULL DEFAULT 0,
    grand_total         INTEGER NOT NULL DEFAULT 0,       -- sum of line totals - discount
    amount_paid         INTEGER NOT NULL DEFAULT 0,       -- sum of valid rental payments
    remaining           INTEGER NOT NULL DEFAULT 0,       -- grand_total - amount_paid
    receipt_print_count INTEGER NOT NULL DEFAULT 0,       -- Phase 8 reprint tracking
    created_by          INTEGER REFERENCES users(id),
    updated_by          INTEGER REFERENCES users(id),
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT    DEFAULT NULL,
    sync_status         TEXT    NOT NULL DEFAULT 'local',
    last_synced_at      TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 9. BOOKING_ITEMS
  //    line_no    = 1-based line number within the booking
  //    detail_no  = booking_no * 100 + line_no  (e.g. 47-01 → 4701)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS booking_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id             TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    booking_id          INTEGER NOT NULL REFERENCES bookings(id),
    line_no             INTEGER NOT NULL,
    detail_no           INTEGER NOT NULL,                 -- booking_no*100 + line_no
    dress_id            INTEGER REFERENCES dresses(id),
    dress_name_snapshot TEXT    NOT NULL,                 -- keeps old receipts correct
    size                TEXT,
    quantity            INTEGER NOT NULL DEFAULT 1,
    rate                INTEGER NOT NULL DEFAULT 0,       -- rupees, snapshot at booking time
    line_total          INTEGER NOT NULL DEFAULT 0,       -- quantity * rate
    description         TEXT,
    jewellery           INTEGER NOT NULL DEFAULT 0,
    clutch_purse        INTEGER NOT NULL DEFAULT 0,
    hand_bag            INTEGER NOT NULL DEFAULT 0,
    double_dupatta      INTEGER NOT NULL DEFAULT 0,
    shoes               INTEGER NOT NULL DEFAULT 0,
    is_ready            INTEGER NOT NULL DEFAULT 0,       -- Phase 9 night-before preparation tick
    item_condition      TEXT DEFAULT 'OK',                -- Phase 9 item condition
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT    DEFAULT NULL,
    sync_status         TEXT    NOT NULL DEFAULT 'local',
    last_synced_at      TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 10. PAYMENTS  (append-only; void = add void row, not edit)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    booking_id      INTEGER NOT NULL REFERENCES bookings(id),
    amount          INTEGER NOT NULL,                     -- rupees
    payment_method  TEXT    NOT NULL DEFAULT 'cash'
                    CHECK(payment_method IN ('cash','bank','wallet','other')),
    kind            TEXT    NOT NULL DEFAULT 'rental'
                    CHECK(kind IN ('rental','deposit','deposit_refund')),
    received_by     INTEGER REFERENCES users(id),
    note            TEXT,
    paid_on         TEXT    NOT NULL,                     -- YYYY-MM-DD
    is_void         INTEGER NOT NULL DEFAULT 0,
    void_reason     TEXT,
    voided_by       INTEGER REFERENCES users(id),
    voided_at       TEXT    DEFAULT NULL,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sync_status     TEXT    NOT NULL DEFAULT 'local',
    last_synced_at  TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 11. AUDIT_LOGS  (immutable — never delete)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    user_id         INTEGER REFERENCES users(id),
    action          TEXT    NOT NULL,
    table_name      TEXT,
    record_id       INTEGER,
    old_values      TEXT,
    new_values      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 12. SYNC_OUTBOX  (Phase 13)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT    NOT NULL,
    operation       TEXT    NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
    record_sync_id  TEXT    NOT NULL,
    payload         TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','processing','done','failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // 13. SYNC_CONFLICTS  (Phase 13)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT    NOT NULL,
    record_sync_id  TEXT    NOT NULL,
    local_data      TEXT    NOT NULL,
    remote_data     TEXT    NOT NULL,
    resolution      TEXT    CHECK(resolution IN ('local','remote','manual',NULL)),
    resolved_by     INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    resolved_at     TEXT    DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────────────────────────────────
  // INDEXES — keep searches fast with 5 000+ bookings
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_customers_name       ON customers(name)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_phone      ON customers(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_cnic       ON customers(cnic)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_city       ON customers(city_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_cast       ON customers(cast_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dresses_name         ON dresses(name)`,
  `CREATE INDEX IF NOT EXISTS idx_dresses_category     ON dresses(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dresses_active       ON dresses(active)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_no          ON bookings(booking_no)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_customer    ON bookings(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_status      ON bookings(status)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_delivery    ON bookings(delivery_date)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_returning   ON bookings(returning_date)`,
  `CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_booking_items_dress  ON booking_items(dress_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_booking     ON payments(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_table     ON audit_logs(table_name, record_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_outbox_status   ON sync_outbox(status)`,

  // ──────────────────────────────────────────────────────────────────────────
  // 14. SETTINGS (Shop details, receipt footer, printer layout defaults)
  // ──────────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
];

module.exports = { SCHEMA_STATEMENTS };
