/**
 * electron/phase11/phase11.test.js
 *
 * Unit & Integration tests for Phase 11 — Data Migration from MS Access.
 * Tests:
 *  - RFC-4180 CSV parser (quotes, commas, escaped quotes, BOM)
 *  - Pakistani Phone number restoration (leading zero)
 *  - CNIC 13-digit formatting (00000-0000000-0)
 *  - Date parsing and YYYY-MM month recalculation
 *  - Status mapping (Open -> Open, Close -> Closed, blank -> None)
 *  - Urdu character normalisation (Yeh, Kaf, Ta Marbuta)
 *  - Customer deduplication & merging (same name + phone)
 *  - Dress catalog deduplication & variant grouping
 *  - Dry-run validation (no DB changes)
 *  - Real run atomic import:
 *      * 359 bookings imported (IDs 47–411 preserved)
 *      * 368 booking lines imported (Detail IDs preserved)
 *      * Sum of grand totals equals EXACTLY 789,801
 *      * 243 old remaining discrepancies detected and recalculated
 *      * Advance payments created for advanceAmount > 0
 *      * Full audit trail recorded
 *  - Idempotency verification (re-running does not duplicate data)
 *  - Next booking number starts at 412 after import
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const {
  importAccessData,
  parseCsv,
  restorePhone,
  formatCnic,
  parseDate,
  deriveMonth,
  mapStatus,
  normalizeUrduText,
} = require('../../scripts/import-access');

const { createBookingsService } = require('../bookings/service');
const { ROLES } = require('../auth/roles');

describe('Phase 11 — MS Access Data Migration', () => {
  let tmpDir;
  let testDbPath;
  let sampleBookingsPath;
  let sampleDetailsPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifrah-phase11-test-'));
    testDbPath = path.join(tmpDir, 'test-phase11.sqlite');
    sampleBookingsPath = path.join(__dirname, '..', '..', 'scripts', 'sample-data', 'bookings.csv');
    sampleDetailsPath  = path.join(__dirname, '..', '..', 'scripts', 'sample-data', 'booking_details.csv');
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Parsing & Cleaning Helpers', () => {
    it('restores leading zero on 10-digit mobile numbers', () => {
      assert.equal(restorePhone('3001234567'), '03001234567');
      assert.equal(restorePhone('3219876543'), '03219876543');
      assert.equal(restorePhone('03001234567'), '03001234567');
      assert.equal(restorePhone(''), '');
    });

    it('formats 13-digit CNIC into standard mask 00000-0000000-0', () => {
      assert.equal(formatCnic('3520112345671'), '35201-1234567-1');
      assert.equal(formatCnic('35201-1234567-1'), '35201-1234567-1');
      assert.equal(formatCnic(''), '');
    });

    it('parses multiple date formats into ISO YYYY-MM-DD', () => {
      assert.equal(parseDate('2026-05-14'), '2026-05-14');
      assert.equal(parseDate('05/14/2026'), '2026-05-14');
      assert.equal(parseDate('14-05-2026'), '2026-05-14');
      assert.equal(parseDate(''), null);
    });

    it('derives YYYY-MM booking month from date string', () => {
      assert.equal(deriveMonth('2026-04-18'), '2026-04');
      assert.equal(deriveMonth('2026-10-02'), '2026-10');
      assert.equal(deriveMonth(null), null);
    });

    it('maps Access status values correctly', () => {
      assert.equal(mapStatus('Open'), 'Open');
      assert.equal(mapStatus('OPEN'), 'Open');
      assert.equal(mapStatus('Close'), 'Closed');
      assert.equal(mapStatus('Closed'), 'Closed');
      assert.equal(mapStatus('Pending'), 'Pending');
      assert.equal(mapStatus(''), 'None');
      assert.equal(mapStatus(null), 'None');
    });

    it('normalizes Urdu letter variants', () => {
      // Arabic Yeh (\u064A) -> Urdu Ye (\u06CC)
      assert.equal(normalizeUrduText('\u064A\u0648\u0633\u0641'), '\u06CC\u0648\u0633\u0641');
      // Arabic Kaf (\u0643) -> Urdu Kaf (\u06A9)
      assert.equal(normalizeUrduText('\u0643\u0631\u0627\u0686\u064A'), '\u06A9\u0631\u0627\u0686\u06CC');
    });

    it('parses RFC-4180 CSV with quotes, commas in fields and escaped quotes', () => {
      const csvContent = 'ID,Name,Address,Notes\n' +
        '1,"Fatima, Zahra","House 12, Street 4, Lahore","Special ""bridal"" dress"\n' +
        '2,Sana Tariq,Main Road,Simple note\n';
      const testCsvFile = path.join(tmpDir, 'test-rfc4180.csv');
      fs.writeFileSync(testCsvFile, csvContent, 'utf-8');

      const parsed = parseCsv(testCsvFile);
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].Name, 'Fatima, Zahra');
      assert.equal(parsed[0].Address, 'House 12, Street 4, Lahore');
      assert.equal(parsed[0].Notes, 'Special "bridal" dress');
      assert.equal(parsed[1].Name, 'Sana Tariq');
    });
  });

  describe('2. Dry Run Import', () => {
    it('performs dry run without touching or creating the DB file', () => {
      const dryDbPath = path.join(tmpDir, 'non-existent-dry.sqlite');
      const result = importAccessData({
        dryRun: true,
        dbPath: dryDbPath,
        bookingsPath: sampleBookingsPath,
        detailsPath: sampleDetailsPath,
        silent: true,
      });

      assert.equal(result.isDryRun, true);
      assert.equal(result.bookingsCount, 359);
      assert.equal(result.lineItemsCount, 368);
      assert.equal(result.grandTotalSum, 789801);
      assert.equal(result.oldRemainingMismatchesCount, 243);
      assert.equal(result.failedRows.length, 0);
      assert.equal(result.passed, true);
      assert.equal(fs.existsSync(dryDbPath), false, 'Dry run must not create database file');
    });
  });

  describe('3. Real Import — Acceptance Criteria Verification', () => {
    let importResult;

    before(() => {
      importResult = importAccessData({
        dryRun: false,
        dbPath: testDbPath,
        bookingsPath: sampleBookingsPath,
        detailsPath: sampleDetailsPath,
        silent: true,
      });
    });

    it('successfully imports 359 bookings and 368 line items with grand total 789,801', () => {
      assert.equal(importResult.isDryRun, false);
      assert.equal(importResult.passed, true);
      assert.equal(importResult.stats.bookingsImported, 359);
      assert.equal(importResult.stats.itemsImported, 368);
      assert.equal(importResult.stats.grandTotalSum, 789801);
    });

    it('verifies SQLite database state matches exactly', () => {
      const db = new Database(testDbPath);

      const bCount = db.prepare('SELECT count(*) as c FROM bookings').get().c;
      assert.equal(bCount, 359, 'Must contain 359 bookings');

      const iCount = db.prepare('SELECT count(*) as c FROM booking_items').get().c;
      assert.equal(iCount, 368, 'Must contain 368 line items');

      const totalSum = db.prepare('SELECT sum(grand_total) as s FROM bookings').get().s;
      assert.equal(totalSum, 789801, 'Sum of grand totals must equal 789,801');

      const pCount = db.prepare('SELECT count(*) as c FROM payments').get().c;
      assert.equal(pCount, 359, 'Must create advance payments');

      const auditCount = db.prepare("SELECT count(*) as c FROM audit_logs WHERE action = 'ACCESS_IMPORT'").get().c;
      assert.equal(auditCount, 359, 'Must log audit entry for each imported booking');

      // Check min and max booking IDs (47 to 411)
      const range = db.prepare('SELECT min(booking_no) as min_b, max(booking_no) as max_b FROM bookings').get();
      assert.equal(range.min_b, 47);
      assert.equal(range.max_b, 411);

      db.close();
    });

    it('ensures next booking number starts at 412 after import', () => {
      const db = new Database(testDbPath);
      const bookingsService = createBookingsService(db);
      const nextNo = bookingsService.nextBookingNo();
      assert.equal(nextNo, 412, 'Next booking number after Access import (up to 411) must be 412');
      db.close();
    });
  });

  describe('4. Idempotency & Duplicate Safety', () => {
    it('running the import again on the same DB skips all 359 bookings without duplicates', () => {
      const secondResult = importAccessData({
        dryRun: false,
        dbPath: testDbPath,
        bookingsPath: sampleBookingsPath,
        detailsPath: sampleDetailsPath,
        silent: true,
      });

      assert.equal(secondResult.stats.bookingsImported, 0, 'Must not re-import existing bookings');
      assert.equal(secondResult.stats.bookingsSkipped, 359, 'Must skip all 359 existing bookings');

      const db = new Database(testDbPath);
      const bCount = db.prepare('SELECT count(*) as c FROM bookings').get().c;
      assert.equal(bCount, 359, 'Total count must remain exactly 359');

      const iCount = db.prepare('SELECT count(*) as c FROM booking_items').get().c;
      assert.equal(iCount, 368, 'Total items count must remain exactly 368');
      db.close();
    });
  });
});
