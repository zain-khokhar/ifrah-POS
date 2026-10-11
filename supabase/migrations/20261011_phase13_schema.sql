-- ==============================================================================
-- IFRAH POS - Phase 13 Supabase Cloud Schema & Offline Sync
-- Mirrors SQLite schema with Postgres types, server triggers, RLS, and Storage
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to maintain server_updated_at on any insert or update
CREATE OR REPLACE FUNCTION set_server_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.server_updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper to extract shop_id from JWT claims or fallback to default shop
CREATE OR REPLACE FUNCTION get_auth_shop_id()
RETURNS TEXT AS $$
  SELECT coalesce(
    current_setting('request.jwt.claims', true)::json->>'shop_id',
    'ifrah-pos-default'
  );
$$ LANGUAGE sql STABLE;

-- 1. SHOPS
CREATE TABLE IF NOT EXISTS shops (
  id                  TEXT PRIMARY KEY DEFAULT 'ifrah-pos-default',
  name                TEXT NOT NULL DEFAULT 'Ifrah Collection',
  owner_email         TEXT,
  phone               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  username            TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  role                TEXT NOT NULL CHECK(role IN ('owner','cashier','viewer')),
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_users_shop_username UNIQUE (shop_id, username)
);

-- 3. CITIES
CREATE TABLE IF NOT EXISTS cities (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  name                TEXT NOT NULL,
  name_normalized     TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. CASTS
CREATE TABLE IF NOT EXISTS casts (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  name                TEXT NOT NULL,
  name_normalized     TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. RELATION_TYPES
CREATE TABLE IF NOT EXISTS relation_types (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  name                TEXT NOT NULL,
  name_normalized     TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 6. DRESS_CATEGORIES
CREATE TABLE IF NOT EXISTS dress_categories (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  name                TEXT NOT NULL,
  name_normalized     TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 7. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  name                TEXT NOT NULL,
  phone               TEXT NOT NULL,
  alt_phone           TEXT,
  cnic                TEXT,
  address             TEXT,
  city_id             INTEGER,
  cast_id             INTEGER,
  relation_type_id    INTEGER,
  relative_name       TEXT,
  relative_phone      TEXT,
  relative_cnic       TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 8. DRESSES
CREATE TABLE IF NOT EXISTS dresses (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  dress_code          TEXT NOT NULL,
  name                TEXT NOT NULL,
  category_id         INTEGER,
  color               TEXT,
  fabric              TEXT,
  size                TEXT,
  default_rate        INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  photo_path          TEXT,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 9. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  booking_no          INTEGER NOT NULL,
  customer_id         INTEGER,
  customer_sync_id    TEXT,
  city_id             INTEGER,
  status              TEXT NOT NULL DEFAULT 'None',
  booking_date        TEXT,
  delivery_date       TEXT,
  returning_date      TEXT,
  booking_month       TEXT,
  total_returning_days INTEGER,
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
  grand_total         INTEGER NOT NULL DEFAULT 0,
  amount_paid         INTEGER NOT NULL DEFAULT 0,
  remaining           INTEGER NOT NULL DEFAULT 0,
  receipt_print_count INTEGER NOT NULL DEFAULT 0,
  clash_flag          INTEGER NOT NULL DEFAULT 0,
  clash_note          TEXT,
  created_by          INTEGER,
  updated_by          INTEGER,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 10. BOOKING_ITEMS
CREATE TABLE IF NOT EXISTS booking_items (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  booking_id          INTEGER,
  booking_sync_id     TEXT,
  line_no             INTEGER NOT NULL,
  detail_no           INTEGER NOT NULL,
  dress_id            INTEGER,
  dress_sync_id       TEXT,
  dress_name_snapshot TEXT NOT NULL,
  size                TEXT,
  quantity            INTEGER NOT NULL DEFAULT 1,
  rate                INTEGER NOT NULL DEFAULT 0,
  line_total          INTEGER NOT NULL DEFAULT 0,
  description         TEXT,
  jewellery           INTEGER NOT NULL DEFAULT 0,
  clutch_purse        INTEGER NOT NULL DEFAULT 0,
  hand_bag            INTEGER NOT NULL DEFAULT 0,
  double_dupatta      INTEGER NOT NULL DEFAULT 0,
  shoes               INTEGER NOT NULL DEFAULT 0,
  is_ready            INTEGER NOT NULL DEFAULT 0,
  item_condition      TEXT DEFAULT 'OK',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT DEFAULT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 11. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  booking_id          INTEGER,
  booking_sync_id     TEXT,
  amount              INTEGER NOT NULL,
  payment_method      TEXT NOT NULL DEFAULT 'cash',
  kind                TEXT NOT NULL DEFAULT 'rental',
  received_by         INTEGER,
  note                TEXT,
  paid_on             TEXT NOT NULL,
  is_void             INTEGER NOT NULL DEFAULT 0,
  void_reason         TEXT,
  voided_by           INTEGER,
  voided_at           TEXT DEFAULT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 12. SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  key                 TEXT NOT NULL,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  value               TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (shop_id, key)
);

-- 13. AUDIT_LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  sync_id             TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL DEFAULT 'ifrah-pos-default' REFERENCES shops(id),
  user_id             INTEGER,
  action              TEXT NOT NULL,
  table_name          TEXT,
  record_id           INTEGER,
  old_values          TEXT,
  new_values          TEXT,
  created_at          TEXT NOT NULL,
  server_updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ==============================================================================
-- AUTOMATIC SERVER TRIGGERS FOR server_updated_at
-- ==============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'shops', 'users', 'cities', 'casts', 'relation_types', 'dress_categories',
    'customers', 'dresses', 'bookings', 'booking_items', 'payments', 'settings', 'audit_logs'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_server_updated_at ON %I;', t);
    EXECUTE format('CREATE TRIGGER trg_server_updated_at BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_server_updated_at();', t);
  END LOOP;
END $$;

-- ==============================================================================
-- INDEXES FOR FAST PULL QUERIES (server_updated_at cursor)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_server_upd          ON users(shop_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_server_upd      ON customers(shop_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_dresses_server_upd        ON dresses(shop_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_bookings_server_upd       ON bookings(shop_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_booking_items_server_upd  ON booking_items(shop_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_server_upd       ON payments(shop_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_settings_server_upd       ON settings(shop_id, server_updated_at);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Only authenticated users belonging to shop_id can access records
-- ==============================================================================
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE casts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE dress_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies for each table
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'shops', 'users', 'cities', 'casts', 'relation_types', 'dress_categories',
    'customers', 'dresses', 'bookings', 'booking_items', 'payments', 'settings', 'audit_logs'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS shop_isolation_select ON %I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS shop_isolation_insert ON %I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS shop_isolation_update ON %I;', tbl);

    IF tbl = 'shops' THEN
      EXECUTE format('CREATE POLICY shop_isolation_select ON %I FOR SELECT USING (id = get_auth_shop_id());', tbl);
      EXECUTE format('CREATE POLICY shop_isolation_update ON %I FOR UPDATE USING (id = get_auth_shop_id());', tbl);
    ELSE
      EXECUTE format('CREATE POLICY shop_isolation_select ON %I FOR SELECT USING (shop_id = get_auth_shop_id());', tbl);
      EXECUTE format('CREATE POLICY shop_isolation_insert ON %I FOR INSERT WITH CHECK (shop_id = get_auth_shop_id());', tbl);
      EXECUTE format('CREATE POLICY shop_isolation_update ON %I FOR UPDATE USING (shop_id = get_auth_shop_id());', tbl);
    END IF;
  END LOOP;
END $$;

-- Default Shop Seed
INSERT INTO shops (id, name, phone)
VALUES ('ifrah-pos-default', 'Ifrah Collection', '0300-1234567')
ON CONFLICT (id) DO NOTHING;
