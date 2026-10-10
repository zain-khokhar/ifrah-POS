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

let _db = null;

/**
 * Returns the singleton DB instance.
 * Creates DB file if it doesn't exist yet.
 */
function getDb() {
  if (_db) return _db;

  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'database');

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

  return _db;
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
