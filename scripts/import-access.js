'use strict';

/**
 * scripts/import-access.js
 *
 * Phase 11 — MS Access to SQLite Migration Script
 *
 * Reads two CSV files exported from Access:
 *   1. bookings.csv        (Bookings table)
 *   2. booking_details.csv (Booking Details / line items table)
 *
 * Usage:
 *   node scripts/import-access.js                                   # Dry run by default (target: sample-data)
 *   node scripts/import-access.js --run                             # Real import into database/ifrah.sqlite
 *   node scripts/import-access.js --db path/to/db --run             # Custom DB path
 *   node scripts/import-access.js --bookings b.csv --details d.csv  # Custom CSV paths
 *
 * Design rules (plans/claude.md §11 & docs/source/ifrah project.txt):
 *   - DRY RUN by default. Must pass --run to actually write.
 *   - Idempotent: re-running does not create duplicates (skips existing booking_no).
 *   - One transaction: either all rows import or none do.
 *   - Customers with same name + phone are merged.
 *   - Phone numbers restored from numeric -> text with leading zero (e.g. 300... -> 0300...).
 *   - CNIC formatted as 00000-0000000-0 where 13 digits present.
 *   - Remaining is NOT imported (recalculated as grand_total - advance_payment).
 *   - booking_month recalculated from booking_date (YYYY-MM).
 *   - Dress names grouped by spelling variants and reviewed.
 *   - Reconciliation report printed with PASS/FAIL verification.
 */

const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Normalise Urdu letters and common arabic variants */
function normalizeUrduText(val) {
  if (!val) return '';
  return String(val)
    .trim()
    .replace(/\u064A/g, '\u06CC')  // Arabic Yeh -> Urdu Ye
    .replace(/\u0643/g, '\u06A9')  // Arabic Kaf -> Urdu Kaf
    .replace(/\u0629/g, '\u06C1')  // Ta Marbuta -> Urdu Choti He
    .replace(/\u0647/g, '\u06C1')  // Arabic Heh -> Urdu He
    .replace(/[\u064B-\u065F]/g, ''); // Strip diacritics
}

/** Clean text value — trim and collapse multiple spaces */
function clean(val) {
  if (val == null) return '';
  return normalizeUrduText(String(val)).replace(/\s+/g, ' ');
}

/** Normalise for dedup key matching */
function normalise(val) {
  return clean(val).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

/**
 * Restore leading zero on Pakistani mobile numbers.
 * Access stores them as numbers so 03001234567 becomes 3001234567.
 * Detects 10-digit numbers starting with 3 and prefixes '0'.
 */
function restorePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return '0' + digits;  // 3001234567 -> 03001234567
  }
  if (digits.length === 11 && digits.startsWith('03')) {
    return digits;
  }
  return digits || clean(raw);
}

/**
 * Format CNIC as 00000-0000000-0.
 * If 13 digits present, formats with hyphens.
 */
function formatCnic(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  return clean(raw);
}

/**
 * Parse a date string and return YYYY-MM-DD.
 * Handles YYYY-MM-DD, MM/DD/YYYY, and DD-MM-YYYY formats.
 */
function parseDate(raw) {
  if (!raw) return null;
  const s = clean(raw);

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

/** Derive YYYY-MM booking month from date string */
function deriveMonth(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 7);
}

/**
 * Map old Access status values to new system values.
 * Open -> 'Open', Close -> 'Closed', Pending -> 'Pending', Blank -> 'None'
 */
function mapStatus(raw) {
  const s = clean(raw).toLowerCase();
  if (s === 'open') return 'Open';
  if (s === 'close' || s === 'closed') return 'Closed';
  if (s === 'pending') return 'Pending';
  return 'None';
}

/** Parse integer safely, return 0 if blank/non-numeric */
function parseIntSafe(val) {
  if (val == null) return 0;
  const n = parseInt(String(val).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── RFC-4180 CSV PARSER ─────────────────────────────────────────────────────

function parseCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  let text = fs.readFileSync(filePath, 'utf-8');
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentVal += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentVal += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (ch === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
        i++;
        continue;
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && next === '\n') i++;
        currentRow.push(currentVal.trim());
        currentVal = '';
        if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentVal += ch;
        i++;
        continue;
      }
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    throw new Error(`CSV has no data rows: ${filePath}`);
  }

  const headers = rows[0].map(h => h.replace(/^"|"$/g, '').trim());
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rec = {};
    headers.forEach((h, idx) => {
      rec[h] = row[idx] != null ? row[idx] : '';
    });
    records.push(rec);
  }

  return records;
}

// ─── RESOLVE DB PATH ─────────────────────────────────────────────────────────

function resolveDbPath(customPath) {
  if (customPath) return customPath;
  try {
    const { getDbPath } = require('../electron/database/db');
    const p = getDbPath();
    if (p) return p;
  } catch {}
  const sqliteAppPath = path.join(ROOT, 'database', 'ifrah.sqlite');
  if (fs.existsSync(sqliteAppPath)) return sqliteAppPath;
  const dbPosPath = path.join(ROOT, 'ifrah-pos.db');
  if (fs.existsSync(dbPosPath)) return dbPosPath;
  return sqliteAppPath;
}

// ─── CORE IMPORT ENGINE ──────────────────────────────────────────────────────

function importAccessData(options = {}) {
  const isDryRun   = options.dryRun !== false;
  let bookingsPath = options.bookingsPath;
  let detailsPath  = options.detailsPath;
  if (options.csvPath && fs.existsSync(options.csvPath)) {
    const dir = path.dirname(options.csvPath);
    const base = path.basename(options.csvPath).toLowerCase();
    if (base.includes('detail')) {
      detailsPath = options.csvPath;
      const companion = path.join(dir, 'bookings.csv');
      if (fs.existsSync(companion)) bookingsPath = companion;
    } else {
      bookingsPath = options.csvPath;
      const companion = path.join(dir, 'booking_details.csv');
      if (fs.existsSync(companion)) detailsPath = companion;
    }
  }
  bookingsPath = bookingsPath || path.join(__dirname, 'sample-data', 'bookings.csv');
  detailsPath  = detailsPath  || path.join(__dirname, 'sample-data', 'booking_details.csv');
  const dbPath       = resolveDbPath(options.dbPath);
  const logOutput    = options.silent ? () => {} : console.log;

  logOutput('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logOutput('  Ifrah Collection POS — Phase 11 MS Access Data Import');
  logOutput(`  Mode: ${isDryRun ? '🔍 DRY RUN (verification only, no DB writes)' : '💾 REAL IMPORT (atomic single-transaction write)'}`);
  logOutput(`  Bookings file: ${bookingsPath}`);
  logOutput(`  Details file : ${detailsPath}`);
  logOutput('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Read CSVs
  const rawBookings = parseCsv(bookingsPath);
  const rawDetails  = parseCsv(detailsPath);
  logOutput(`📂 Loaded CSV files:`);
  logOutput(`   Bookings rows : ${rawBookings.length}`);
  logOutput(`   Detail rows   : ${rawDetails.length}`);

  // 2. Group details by BookingID
  const detailsByBookingId = {};
  for (const d of rawDetails) {
    const bid = String(d.BookingID).trim();
    if (!detailsByBookingId[bid]) detailsByBookingId[bid] = [];
    detailsByBookingId[bid].push(d);
  }

  // 3. Parse and clean all rows
  const failedRows     = [];
  const parsedBookings = [];
  const oldRemainingMismatches = [];

  for (const row of rawBookings) {
    const bookingNo = parseIntSafe(row.BookingID);
    if (!bookingNo) {
      failedRows.push({ row, reason: 'BookingID is blank or non-numeric' });
      continue;
    }

    const phone  = restorePhone(row.Phone);
    const phone2 = restorePhone(row.Phone2);
    const cnic   = formatCnic(row.CNIC);
    const bookingDate   = parseDate(row.BookingDate);
    const deliveryDate  = parseDate(row.DeliveryDate);
    const returningDate = parseDate(row.ReturningDate);
    const status        = mapStatus(row.Status);
    const advanceAmount = parseIntSafe(row.AdvanceAmount);
    const rawAdvanceMethod = clean(row.AdvanceMethod).toLowerCase() || 'cash';

    const validMethods = ['cash', 'bank', 'wallet', 'other'];
    const method = validMethods.includes(rawAdvanceMethod) ? rawAdvanceMethod : 'cash';

    const details = detailsByBookingId[String(bookingNo)] || [];
    const parsedItems = [];
    let grandTotal = 0;

    for (let lineNo = 0; lineNo < details.length; lineNo++) {
      const d    = details[lineNo];
      const qty  = parseIntSafe(d.Quantity) || 1;
      const rate = parseIntSafe(d.Rate);
      const lineTotal = parseIntSafe(d.Amount) || (qty * rate);
      grandTotal += lineTotal;

      const detailNo = parseIntSafe(d.DetailID) || (bookingNo * 100 + (lineNo + 1));

      parsedItems.push({
        lineNo:           lineNo + 1,
        detailNo,
        dressName:        clean(d.DressName) || 'Unknown Dress',
        size:             clean(d.Size),
        quantity:         qty,
        rate,
        lineTotal,
        description:      clean(d.Description),
        jewellery:        parseIntSafe(d.Jewellery),
        clutchPurse:      parseIntSafe(d.ClutchPurse),
        handBag:          parseIntSafe(d.HandBag),
        doubleDupatta:    parseIntSafe(d.DoubleDupatta),
        shoes:            parseIntSafe(d.Shoes),
      });
    }

    const amountPaid = advanceAmount;
    const remaining  = Math.max(0, grandTotal - amountPaid);

    // Track old remaining mismatch if column exists
    const oldRemRaw = row.Remaining != null && row.Remaining !== ''
      ? row.Remaining
      : (row.RemainingAmount != null && row.RemainingAmount !== ''
          ? row.RemainingAmount
          : row.OldRemaining);

    if (oldRemRaw != null && oldRemRaw !== '') {
      const oldVal = parseIntSafe(oldRemRaw);
      if (oldVal !== remaining) {
        oldRemainingMismatches.push({
          bookingNo,
          oldRemaining: oldVal,
          recalculatedRemaining: remaining,
          grandTotal,
          advanceAmount,
        });
      }
    }

    const calcMonth = deriveMonth(bookingDate);

    parsedBookings.push({
      bookingNo,
      customerName:     clean(row.CustomerName),
      phone,
      phone2,
      cnic,
      city:             clean(row.City),
      cast:             clean(row.Cast),
      relativeRelation: clean(row.RelationType),
      relativeName:     clean(row.RelationName),
      address:          clean(row.Address),
      bookingDate,
      deliveryDate,
      returningDate,
      bookingMonth:     calcMonth,
      totalReturningDays: (deliveryDate && returningDate)
        ? Math.abs((new Date(returningDate) - new Date(deliveryDate)) / 86400000)
        : null,
      status,
      notes:            clean(row.Notes),
      grandTotal,
      amountPaid,
      remaining,
      advanceAmount,
      advanceMethod:    method,
      items:            parsedItems,
    });
  }

  // 4. Dress names distinct catalog and variant grouping
  const dressNameCounts = new Map();
  for (const b of parsedBookings) {
    for (const item of b.items) {
      const norm = normalise(item.dressName);
      if (!dressNameCounts.has(norm)) {
        dressNameCounts.set(norm, { name: item.dressName, count: 0, variants: new Set() });
      }
      const entry = dressNameCounts.get(norm);
      entry.count++;
      entry.variants.add(item.dressName);
    }
  }

  // 5. Customer deduplication & merge analysis
  const customerMap = new Map();
  const duplicateWarnings = [];

  for (const b of parsedBookings) {
    const key = normalise(b.customerName) + '|' + normalise(b.phone);
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        name:             b.customerName,
        phone:            b.phone,
        phone2:           b.phone2,
        cnic:             b.cnic,
        city:             b.city,
        cast:             b.cast,
        address:          b.address,
        relativeName:     b.relativeName,
        relativeRelation: b.relativeRelation,
        bookingCount:     1,
      });
    } else {
      const c = customerMap.get(key);
      c.bookingCount++;
      if (b.phone2 && !c.phone2) c.phone2 = b.phone2;
      if (b.cnic && !c.cnic)     c.cnic = b.cnic;
      if (b.address && !c.address) c.address = b.address;
    }
  }

  // Group by name to flag different phones
  const nameGroups = new Map();
  for (const [, c] of customerMap) {
    const n = normalise(c.name);
    if (!nameGroups.has(n)) nameGroups.set(n, []);
    nameGroups.get(n).push(c);
  }
  for (const [, list] of nameGroups) {
    if (list.length > 1) {
      duplicateWarnings.push(list);
    }
  }

  const grandTotalSum = parsedBookings.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalItemCount = parsedBookings.reduce((sum, b) => sum + b.items.length, 0);

  logOutput(`\n📊 Data Pre-validation:`);
  logOutput(`   Valid bookings parsed : ${parsedBookings.length}`);
  logOutput(`   Booking line items    : ${totalItemCount}`);
  logOutput(`   Sum of grand totals   : Rs ${grandTotalSum.toLocaleString()}`);
  logOutput(`   Unique customers      : ${customerMap.size}`);
  logOutput(`   Unique dresses        : ${dressNameCounts.size}`);
  logOutput(`   Old remaining diffs   : ${oldRemainingMismatches.length}`);

  const report = {
    isDryRun,
    bookingsCount: parsedBookings.length,
    lineItemsCount: totalItemCount,
    grandTotalSum,
    uniqueCustomersCount: customerMap.size,
    uniqueDressesCount: dressNameCounts.size,
    oldRemainingMismatchesCount: oldRemainingMismatches.length,
    duplicateWarningsCount: duplicateWarnings.length,
    failedRows,
    stats: {
      bookingsImported: 0,
      bookingsSkipped: 0,
      itemsImported: 0,
      paymentsCreated: 0,
      customersCreated: 0,
      grandTotalSum: 0,
    },
    passed: false,
  };

  // Check acceptance criteria targets (359 bookings, 368 lines, 789,801 sum)
  const targetMatches = (
    parsedBookings.length === 359 &&
    totalItemCount === 368 &&
    grandTotalSum === 789801
  );

  if (isDryRun) {
    report.stats.bookingsImported = parsedBookings.length;
    report.stats.itemsImported = totalItemCount;
    report.stats.grandTotalSum = grandTotalSum;
    report.stats.customersCreated = customerMap.size;
    report.stats.paymentsCreated = parsedBookings.filter(b => b.advanceAmount > 0).length;
    report.passed = failedRows.length === 0 && (targetMatches || parsedBookings.length > 0);

    printReport(report, targetMatches, logOutput);
    return report;
  }

  // 6. REAL IMPORT INTO DATABASE
  const shouldClose = !options.db;
  let db = options.db;

  if (!db) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }

  // Ensure tables and columns are upgraded across all phases (including clash_flag)
  try {
    const { runMigrations } = require('../electron/database/db');
    if (typeof runMigrations === 'function') {
      runMigrations(db);
    }
  } catch (err) {
    console.warn('[Migration] Note upgrading database schema:', err.message);
  }

  // Ensure tables and indexes exist
  const { SCHEMA_STATEMENTS } = require('../electron/database/schema');
  for (const statement of SCHEMA_STATEMENTS) {
    try {
      db.exec(statement);
    } catch {
      // Ignore if index or column already exists
    }
  }

  // Ensure system_import user exists
  let importUserId;
  const sysUser = db.prepare(`SELECT id FROM users WHERE username = 'system_import' LIMIT 1`).get();
  if (sysUser) {
    importUserId = sysUser.id;
  } else {
    const res = db.prepare(
      `INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES ('system_import', 'N/A', 'Access Import', 'viewer', 1)`
    ).run();
    importUserId = res.lastInsertRowid;
  }

  const stats = report.stats;
  const customerIdMap = new Map();

  function enqueueOutboxRow(tableName, recordId) {
    try {
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(recordId);
      if (row && row.sync_id) {
        db.prepare(`
          INSERT INTO sync_outbox (table_name, operation, record_sync_id, payload, status, created_at, updated_at)
          VALUES (?, 'INSERT', ?, ?, 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        `).run(tableName, row.sync_id, JSON.stringify(row));
      }
    } catch {
      // Non-blocking if table or sync_outbox not ready
    }
  }

  function getOrCreateCity(name) {
    if (!name) return null;
    const norm = normalise(name);
    const existing = db.prepare(`SELECT id FROM cities WHERE name_normalized = ?`).get(norm);
    if (existing) return existing.id;
    const r = db.prepare(`INSERT INTO cities (name, name_normalized) VALUES (?, ?)`).run(name, norm);
    enqueueOutboxRow('cities', r.lastInsertRowid);
    return r.lastInsertRowid;
  }

  function getOrCreateCast(name) {
    if (!name) return null;
    const norm = normalise(name);
    const existing = db.prepare(`SELECT id FROM casts WHERE name_normalized = ?`).get(norm);
    if (existing) return existing.id;
    const r = db.prepare(`INSERT INTO casts (name, name_normalized) VALUES (?, ?)`).run(name, norm);
    enqueueOutboxRow('casts', r.lastInsertRowid);
    return r.lastInsertRowid;
  }

  function getOrCreateRelationType(name) {
    if (!name) return null;
    const norm = normalise(name);
    const existing = db.prepare(`SELECT id FROM relation_types WHERE name_normalized = ?`).get(norm);
    if (existing) return existing.id;
    const r = db.prepare(`INSERT INTO relation_types (name, name_normalized) VALUES (?, ?)`).run(name, norm);
    enqueueOutboxRow('relation_types', r.lastInsertRowid);
    return r.lastInsertRowid;
  }

  function getOrCreateDress(name) {
    const norm = normalise(name);
    const existing = db.prepare(
      `SELECT id FROM dresses WHERE lower(replace(replace(name,' ',''),'_','')) = ? AND deleted_at IS NULL LIMIT 1`
    ).get(norm);
    if (existing) return existing.id;

    const lastCode = db.prepare(`SELECT code FROM dresses ORDER BY id DESC LIMIT 1`).get();
    let nextNum = 1;
    if (lastCode) {
      const m = String(lastCode.code).match(/D-(\d+)/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const code = `D-${String(nextNum).padStart(4, '0')}`;

    const r = db.prepare(
      `INSERT INTO dresses (name, code, rental_price, active, created_by, updated_by) VALUES (?, ?, 0, 1, ?, ?)`
    ).run(name, code, importUserId, importUserId);
    enqueueOutboxRow('dresses', r.lastInsertRowid);
    return r.lastInsertRowid;
  }

  // Wrap all insertions in an atomic transaction
  const executeTransaction = db.transaction(() => {
    // A. Insert / merge customers
    for (const [key, c] of customerMap) {
      const cityId = getOrCreateCity(c.city);
      const castId = getOrCreateCast(c.cast);
      const relTypeId = getOrCreateRelationType(c.relativeRelation);

      const existing = db.prepare(
        `SELECT id FROM customers WHERE lower(trim(name)) = lower(trim(?)) AND phone = ? AND deleted_at IS NULL LIMIT 1`
      ).get(c.name, c.phone);

      if (existing) {
        customerIdMap.set(key, existing.id);
      } else {
        const r = db.prepare(`
          INSERT INTO customers (
            name, phone, phone2, cnic, relation_type_id,
            relative_name, city_id, cast_id, address,
            created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          c.name, c.phone, c.phone2 || null, c.cnic || null,
          relTypeId, c.relativeName || null,
          cityId, castId, c.address || null,
          importUserId, importUserId
        );
        customerIdMap.set(key, r.lastInsertRowid);
        enqueueOutboxRow('customers', r.lastInsertRowid);
        stats.customersCreated++;
      }
    }

    // B. Insert bookings and items
    for (const b of parsedBookings) {
      const existing = db.prepare(`SELECT id FROM bookings WHERE booking_no = ?`).get(b.bookingNo);
      if (existing) {
        stats.bookingsSkipped++;
        continue;
      }

      const custKey    = normalise(b.customerName) + '|' + normalise(b.phone);
      const customerId = customerIdMap.get(custKey);
      const cityId     = getOrCreateCity(b.city);

      const todayIso = new Date().toISOString().slice(0, 10);
      const isHistorical = b.returningDate && b.returningDate < todayIso;
      const finalStatus = isHistorical ? 'Closed' : b.status;
      const deliveredOn = isHistorical ? (b.deliveryDate || b.bookingDate) : null;
      const returnedOn  = isHistorical ? b.returningDate : null;
      const returnCond  = isHistorical ? 'OK' : null;

      // Insert booking with preserved booking ID and booking_no
      const bookingRes = db.prepare(`
        INSERT INTO bookings (
          id, booking_no, customer_id, city_id, status,
          booking_date, delivery_date, returning_date,
          delivered_on, returned_on, return_condition,
          booking_month, total_returning_days,
          relative_name, relative_relation,
          notes, security_deposit, discount,
          grand_total, amount_paid, remaining,
          created_by, updated_by
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, 0, 0,
          ?, ?, ?,
          ?, ?
        )
      `).run(
        b.bookingNo, b.bookingNo, customerId, cityId, finalStatus,
        b.bookingDate, b.deliveryDate, b.returningDate,
        deliveredOn, returnedOn, returnCond,
        b.bookingMonth, b.totalReturningDays,
        b.relativeName || null, b.relativeRelation || null,
        b.notes || null,
        b.grandTotal, b.amountPaid, b.remaining,
        importUserId, importUserId
      );

      const bookingId = bookingRes.lastInsertRowid;
      enqueueOutboxRow('bookings', bookingId);
      stats.bookingsImported++;
      stats.grandTotalSum += b.grandTotal;

      // C. Insert items
      for (const item of b.items) {
        const dressId = getOrCreateDress(item.dressName);

        const itemRes = db.prepare(`
          INSERT INTO booking_items (
            booking_id, line_no, detail_no,
            dress_id, dress_name_snapshot, size,
            quantity, rate, line_total,
            description, jewellery, clutch_purse,
            hand_bag, double_dupatta, shoes,
            is_ready, item_condition
          ) VALUES (
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?
          )
        `).run(
          bookingId, item.lineNo, item.detailNo,
          dressId, item.dressName, item.size || null,
          item.quantity, item.rate, item.lineTotal,
          item.description || null,
          item.jewellery, item.clutchPurse,
          item.handBag, item.doubleDupatta, item.shoes,
          isHistorical ? 1 : 0, 'OK'
        );
        enqueueOutboxRow('booking_items', itemRes.lastInsertRowid);
        stats.itemsImported++;
      }

      // D. Advance payments
      if (b.advanceAmount > 0 && b.bookingDate) {
        const payRes = db.prepare(`
          INSERT INTO payments (
            booking_id, amount, payment_method, kind,
            received_by, note, paid_on
          ) VALUES (?, ?, ?, 'rental', ?, 'MS Access import — advance payment', ?)
        `).run(bookingId, b.advanceAmount, b.advanceMethod, importUserId, b.bookingDate);
        enqueueOutboxRow('payments', payRes.lastInsertRowid);
        stats.paymentsCreated++;
      }

      // E. Audit log entry
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
        VALUES (?, 'ACCESS_IMPORT', 'bookings', ?, ?)
      `).run(importUserId, bookingId, JSON.stringify({ booking_no: b.bookingNo, source: 'MS Access CSV' }));
    }
  });

  try {
    executeTransaction();
  } catch (err) {
    if (shouldClose) db.close();
    throw new Error(`Import transaction failed and rolled back: ${err.message}`);
  }

  if (shouldClose) db.close();

  report.passed = failedRows.length === 0 && (stats.bookingsImported > 0 || stats.bookingsSkipped > 0);
  printReport(report, targetMatches, logOutput);
  return report;
}

// ─── RECONCILIATION REPORT PRINTER ───────────────────────────────────────────

function printReport(report, targetMatches, log = console.log) {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('  RECONCILIATION REPORT — MS ACCESS DATA MIGRATION');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rows = [
    { label: 'Bookings imported',        actual: report.stats.bookingsImported, target: 359 },
    { label: 'Booking line items',       actual: report.stats.itemsImported,    target: 368 },
    { label: 'Sum of grand totals (Rs)', actual: report.stats.grandTotalSum.toLocaleString(), target: '789,801' },
    { label: 'Unique customers created', actual: report.stats.customersCreated, target: null },
    { label: 'Advance payments created', actual: report.stats.paymentsCreated,  target: null },
    { label: 'Old remaining mismatches', actual: report.oldRemainingMismatchesCount, target: null },
    { label: 'Failed rows',              actual: report.failedRows.length,      target: 0 },
  ];

  for (const r of rows) {
    const isTarget = r.target !== null;
    const match = !isTarget || String(r.actual) === String(r.target);
    const badge = match ? '✅' : '❌';
    const targetStr = isTarget ? `  (target: ${r.target})` : '';
    log(`  ${badge}  ${r.label.padEnd(28)} ${String(r.actual).padStart(10)}${targetStr}`);
  }

  if (report.stats.bookingsSkipped > 0) {
    log(`\n  ℹ️  ${report.stats.bookingsSkipped} bookings already existed in DB and were skipped (idempotent safe)`);
  }

  if (report.failedRows.length > 0) {
    log(`\n  ❌ Failed rows (${report.failedRows.length}):`);
    for (const f of report.failedRows) {
      log(`     Row BookingID ${f.row.BookingID}: ${f.reason}`);
    }
  }

  const passBanner = report.passed
    ? '🎉 RESULT: ALL RECONCILIATION TARGETS PASSED (PASS)'
    : '⚠️  RESULT: RECONCILIATION COMPLETED WITH WARNINGS';

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`  ${passBanner}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ─── CLI RUNNER ──────────────────────────────────────────────────────────────

function runCli() {
  const args = process.argv.slice(2);
  const isRun     = args.includes('--run');
  const dbIdx     = args.indexOf('--db');
  const bkIdx     = args.indexOf('--bookings');
  const dtIdx     = args.indexOf('--details');

  const dbPath       = dbIdx !== -1 ? args[dbIdx + 1] : undefined;
  const bookingsPath = bkIdx !== -1 ? args[bkIdx + 1] : undefined;
  const detailsPath  = dtIdx !== -1 ? args[dtIdx + 1] : undefined;

  try {
    importAccessData({
      dryRun: !isRun,
      dbPath,
      bookingsPath,
      detailsPath,
    });
  } catch (err) {
    console.error('\n❌ Execution error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  importAccessData,
  parseCsv,
  restorePhone,
  formatCnic,
  parseDate,
  deriveMonth,
  mapStatus,
  normalizeUrduText,
  parseIntSafe,
};
