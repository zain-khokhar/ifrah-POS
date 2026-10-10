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
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'database', 'ifrah.sqlite');
}

module.exports = { getDb, closeDb, getDbPath };
