/**
 * electron/database/db.js
 *
 * Single SQLite connection for the entire app.
 * Uses better-sqlite3 (synchronous, fast, no async overhead).
 * DB stored in Electron's userData path so it persists across updates.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { SCHEMA_STATEMENTS } = require('./schema');

let _db = null;

/**
 * Returns the singleton DB instance.
 * Creates DB file if it doesn't exist yet.
 */
function getDb(options = {}) {
  if (_db) return _db;

  const dbDir = options?.dbDir || (
    app && typeof app.getPath === 'function'
      ? path.join(app.getPath('userData'), 'database')
      : path.join(process.cwd(), 'database')
  );

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'ifrah.sqlite');
  console.log('[DB] Opening database at:', dbPath);

  _db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
  });

  // Performance pragmas
  _db.pragma('journal_mode = WAL');   // Better concurrency
  _db.pragma('foreign_keys = ON');    // Enforce FK constraints
  _db.pragma('synchronous = NORMAL'); // Good balance of speed and safety
  _db.pragma('temp_store = MEMORY'); // Temp tables in memory

  runMigrations(_db);

  for (const statement of SCHEMA_STATEMENTS) _db.exec(statement);

  return _db;
}

/**
 * Automatically upgrades existing tables if columns were added across phases.
 */
function runMigrations(db) {
  const tableInfo = (tableName) => {
    try {
      return db.prepare(`PRAGMA table_info(${tableName})`).all();
    } catch {
      return [];
    }
  };

  const hasCol = (tableName, colName) => {
    return tableInfo(tableName).some(c => c.name === colName);
  };

  const rowCount = (tableName) => {
    try {
      const res = db.prepare(`SELECT count(*) as c FROM ${tableName}`).get();
      return res ? res.c : 0;
    } catch {
      return 0;
    }
  };

  const emptyTablesToRecreate = [];

  // Users recovery and contact columns
  if (tableInfo('users').length > 0) {
    if (!hasCol('users', 'email')) {
      try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT;`); } catch {}
    }
    if (!hasCol('users', 'phone')) {
      try { db.exec(`ALTER TABLE users ADD COLUMN phone TEXT;`); } catch {}
    }
    if (!hasCol('users', 'recovery_key')) {
      try { db.exec(`ALTER TABLE users ADD COLUMN recovery_key TEXT;`); } catch {}
    }
    if (!hasCol('users', 'recovery_pin')) {
      try { db.exec(`ALTER TABLE users ADD COLUMN recovery_pin TEXT;`); } catch {}
    }
    if (!hasCol('users', 'reset_token')) {
      try { db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT;`); } catch {}
    }
    if (!hasCol('users', 'reset_token_expires')) {
      try { db.exec(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT;`); } catch {}
    }

    try {
      const ownersWithoutKey = db.prepare(`SELECT id, username FROM users WHERE role = 'owner' AND (recovery_key IS NULL OR recovery_key = '')`).all();
      for (const o of ownersWithoutKey) {
        const randKey = 'IFRAH-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        db.prepare(`UPDATE users SET recovery_key = ?, email = coalesce(email, 'admin@ifrahpos.com') WHERE id = ?`).run(randKey, o.id);
      }
    } catch {}
  }

  if (tableInfo('customers').length > 0 && !hasCol('customers', 'cnic')) {
    if (rowCount('customers') === 0) emptyTablesToRecreate.push('customers');
    else {
      db.exec(`
        ALTER TABLE customers ADD COLUMN cnic TEXT;
        ALTER TABLE customers ADD COLUMN relation_type_id INTEGER;
        ALTER TABLE customers ADD COLUMN relative_name TEXT;
        ALTER TABLE customers ADD COLUMN relative_phone TEXT;
        ALTER TABLE customers ADD COLUMN relative_cnic TEXT;
        ALTER TABLE customers ADD COLUMN created_by INTEGER;
        ALTER TABLE customers ADD COLUMN updated_by INTEGER;
      `);
    }
  }

  if (tableInfo('dresses').length > 0 && !hasCol('dresses', 'category_id')) {
    if (rowCount('dresses') === 0) emptyTablesToRecreate.push('dresses');
    else {
      db.exec(`
        ALTER TABLE dresses ADD COLUMN category_id INTEGER;
        ALTER TABLE dresses ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE dresses ADD COLUMN photo_path TEXT;
      `);
    }
  }

  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'booking_no')) {
    if (rowCount('bookings') === 0) emptyTablesToRecreate.push('bookings');
  }

  if (tableInfo('booking_items').length > 0 && !hasCol('booking_items', 'detail_no')) {
    if (rowCount('booking_items') === 0) emptyTablesToRecreate.push('booking_items');
  }

  if (tableInfo('cities').length > 0 && !hasCol('cities', 'name_normalized')) {
    if (rowCount('cities') === 0) emptyTablesToRecreate.push('cities');
  }

  if (tableInfo('casts').length > 0 && !hasCol('casts', 'name_normalized')) {
    if (rowCount('casts') === 0) emptyTablesToRecreate.push('casts');
  }

  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'receipt_print_count')) {
    try {
      db.exec(`ALTER TABLE bookings ADD COLUMN receipt_print_count INTEGER NOT NULL DEFAULT 0;`);
    } catch (e) {
      console.warn('[DB] Could not add receipt_print_count:', e.message);
    }
  }

  // Phase 9 columns migration
  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'delivery_note')) {
    try { db.exec(`ALTER TABLE bookings ADD COLUMN delivery_note TEXT;`); } catch {}
  }
  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'return_damage_note')) {
    try { db.exec(`ALTER TABLE bookings ADD COLUMN return_damage_note TEXT;`); } catch {}
  }
  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'return_damage_photo')) {
    try { db.exec(`ALTER TABLE bookings ADD COLUMN return_damage_photo TEXT;`); } catch {}
  }
  if (tableInfo('booking_items').length > 0 && !hasCol('booking_items', 'is_ready')) {
    try { db.exec(`ALTER TABLE booking_items ADD COLUMN is_ready INTEGER NOT NULL DEFAULT 0;`); } catch {}
  }
  if (tableInfo('booking_items').length > 0 && !hasCol('booking_items', 'item_condition')) {
    try { db.exec(`ALTER TABLE booking_items ADD COLUMN item_condition TEXT DEFAULT 'OK';`); } catch {}
  }

  // Seed default settings if empty
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    const sCount = db.prepare('SELECT count(*) as c FROM settings').get()?.c || 0;
    if (sCount === 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
      const defaults = [
        ['shop_name', 'Ifrah Collection'],
        ['shop_tagline', 'Exclusive Bridal & Party Wear'],
        ['shop_address', 'Main Bazaar, Near Bank Alfalah'],
        ['shop_phone', '0300-1234567'],
        ['shop_phone2', '0321-7654321'],
        ['shop_city', 'Lahore'],
        ['receipt_footer_ur', 'واپسی پر ڈریس صاف اور درست حالت میں واپس کرنا لازمی ہے۔ تاخیر کی صورت میں یومیہ کرایہ وصول ہوگا۔'],
        ['receipt_footer_en', 'Dress must be returned in good condition. Late return will incur daily rental charges.'],
        ['receipt_default_layout', '80mm'],
        ['receipt_reprint_watermark', '1'],
        ['printer_80mm', ''],
        ['printer_a4', ''],
      ];
      for (const [k, v] of defaults) {
        insert.run(k, v);
      }
    }
  } catch (err) {
    console.warn('[DB] Settings init note:', err.message);
  }

  // Phase 13: Sync clash flag & sync_state
  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'clash_flag')) {
    try { db.exec(`ALTER TABLE bookings ADD COLUMN clash_flag INTEGER NOT NULL DEFAULT 0;`); } catch {}
  }
  if (tableInfo('bookings').length > 0 && !hasCol('bookings', 'clash_note')) {
    try { db.exec(`ALTER TABLE bookings ADD COLUMN clash_note TEXT DEFAULT NULL;`); } catch {}
  }

  // Smart Historical Data Cleanup:
  // If historical bookings from past dates (returning_date < date('now')) are still open,
  // mark them Closed and Returned so they don't clog active Deliveries/Returns or trigger fake clashes
  try {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`
      UPDATE bookings
      SET status = 'Closed',
          delivered_on = COALESCE(delivered_on, delivery_date),
          returned_on = COALESCE(returned_on, returning_date),
          return_condition = COALESCE(return_condition, 'OK'),
          clash_flag = 0,
          clash_note = NULL
      WHERE returning_date < ?
        AND (status IS NULL OR lower(status) != 'closed' OR returned_on IS NULL OR clash_flag = 1)
    `).run(today);

    db.prepare(`
      UPDATE booking_items
      SET is_ready = 1
      WHERE booking_id IN (SELECT id FROM bookings WHERE lower(status) = 'closed')
        AND is_ready = 0
    `).run();
  } catch (err) {
    // Non-blocking
  }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    const stCount = db.prepare('SELECT count(*) as c FROM sync_state').get()?.c || 0;
    if (stCount === 0) {
      const insState = db.prepare('INSERT OR IGNORE INTO sync_state (key, value) VALUES (?, ?)');
      const deviceId = 'pc_' + Math.random().toString(36).substring(2, 10);
      insState.run('device_id', deviceId);
      insState.run('device_name', 'Counter 1');
      insState.run('booking_number_start', '412');
      insState.run('sync_status', 'idle');
      insState.run('last_sync_time', '');
      insState.run('last_pull_cursor', '');
      insState.run('shop_id', 'ifrah-pos-default');
    }
  } catch (err) {
    console.warn('[DB] Sync state init note:', err.message);
  }

  // Phase 14: Performance indexes for 5,000+ bookings
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(delivery_date, returning_date, status);
      CREATE INDEX IF NOT EXISTS idx_bookings_month ON bookings(booking_month);
      CREATE INDEX IF NOT EXISTS idx_booking_items_dress_booking ON booking_items(dress_id, booking_id);
      CREATE INDEX IF NOT EXISTS idx_customers_phone2 ON customers(phone2);
      CREATE INDEX IF NOT EXISTS idx_bookings_clash ON bookings(clash_flag);
    `);
  } catch (err) {
    console.warn('[DB] Performance indexes note:', err.message);
  }

  if (emptyTablesToRecreate.length > 0) {
    db.pragma('foreign_keys = OFF');
    const order = ['booking_items', 'payments', 'bookings', 'dresses', 'customers', 'cities', 'casts'];
    for (const t of order) {
      if (emptyTablesToRecreate.includes(t)) {
        db.exec(`DROP TABLE IF EXISTS ${t}`);
      }
    }
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Closes the DB connection. Call on app quit.
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
    console.log('[DB] Database closed.');
  }
}

/**
 * Returns the path where the DB file is stored (for backup).
 */
function getDbPath() {
  const baseDir = (app && typeof app.getPath === 'function')
    ? path.join(app.getPath('userData'), 'database')
    : path.join(process.cwd(), 'database');
  return path.join(baseDir, 'ifrah.sqlite');
}

module.exports = { getDb, closeDb, getDbPath, runMigrations };
