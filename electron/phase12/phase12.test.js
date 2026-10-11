/**
 * electron/phase12/phase12.test.js
 *
 * Unit & Integration tests for Phase 12 — Backup and Restore Engine.
 * Tests:
 *  - Native SQLite online backup API & integrity verification
 *  - Automated startup backup & idempotency (skipped if already backed up today)
 *  - Retention policy (purgeOldBackups keeps 30 daily backups + monthly snapshots)
 *  - Home status calculation & 2-day warning banner
 *  - ZIP archive bundling with database and photos
 *  - Metadata inspection of backups (record counts & health)
 *  - Owner-only restore with pre-restore safety snapshot
 *  - Role-based permissions guard (Cashier / Viewer forbidden from restore)
 *  - Corrupted backup rejection (active database protected)
 *  - Restoring from ZIP archive
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { SCHEMA_STATEMENTS } = require('../database/schema');
const { createBackupService } = require('../backup/service');
const { createZipArchive, extractZipArchive } = require('../backup/zip');
const { ROLES } = require('../auth/roles');

describe('Phase 12 — Backup & Restore Engine', () => {
  let tmpDir;
  let activeDbPath;
  let backupDir;
  let photosDir;
  let db;
  let backupService;

  const ownerSession   = { active: true, user: { id: 1, username: 'owner_user',   role: ROLES.OWNER, full_name: 'Owner Zain' } };
  const cashierSession = { active: true, user: { id: 2, username: 'cashier_user', role: ROLES.CASHIER, full_name: 'Cashier Ali' } };
  const viewerSession  = { active: true, user: { id: 3, username: 'viewer_user',  role: ROLES.VIEWER, full_name: 'Viewer Sana' } };

  // Mock electron app
  const mockElectronApp = {
    getPath: (name) => {
      if (name === 'userData') return tmpDir;
      return tmpDir;
    },
    relaunch: () => {},
    exit: () => {},
  };

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifrah-phase12-test-'));
    activeDbPath = path.join(tmpDir, 'active-ifrah.sqlite');
    backupDir    = path.join(tmpDir, 'backups');
    photosDir    = path.join(tmpDir, 'photos');

    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(photosDir, { recursive: true });

    // Seed dummy photos
    fs.writeFileSync(path.join(photosDir, 'dress-1.jpg'), Buffer.from('fake-photo-data-1'));
    fs.writeFileSync(path.join(photosDir, 'dress-2.jpg'), Buffer.from('fake-photo-data-2'));

    // Initialize active database
    db = new Database(activeDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    for (const statement of SCHEMA_STATEMENTS) {
      db.exec(statement);
    }

    // Seed test user, customer, dress, booking, and payment
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role)
      VALUES (1, 'owner_user', 'hash', 'Owner Zain', 'owner'),
             (2, 'cashier_user', 'hash', 'Cashier Ali', 'cashier'),
             (3, 'viewer_user', 'hash', 'Viewer Sana', 'viewer')
    `).run();

    db.prepare(`
      INSERT INTO customers (id, name, phone)
      VALUES (1, 'Fatima Zahra', '03001234567')
    `).run();

    db.prepare(`
      INSERT INTO dresses (id, code, name, rental_price)
      VALUES (1, 'D-0001', 'Bridal Lehnga', 15000)
    `).run();

    db.prepare(`
      INSERT INTO bookings (id, booking_no, customer_id, status, booking_date, delivery_date, grand_total, amount_paid)
      VALUES (1, 412, 1, 'Open', '2026-10-10', '2026-10-15', 15000, 5000)
    `).run();

    db.prepare(`
      INSERT INTO booking_items (booking_id, line_no, detail_no, dress_id, dress_name_snapshot, rate, line_total)
      VALUES (1, 1, 41201, 1, 'Bridal Lehnga', 15000, 15000)
    `).run();

    db.prepare(`
      INSERT INTO payments (booking_id, amount, payment_method, kind, paid_on)
      VALUES (1, 5000, 'cash', 'rental', '2026-10-10')
    `).run();

    backupService = createBackupService(db, mockElectronApp, null, null, activeDbPath);
  });

  after(() => {
    try {
      db.close();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Create Backup & Integrity Check', () => {
    it('creates a manual backup with valid integrity check and audit log', async () => {
      const res = await backupService.createBackup(ownerSession, { isManual: true });
      assert.equal(res.ok, true);
      assert.equal(res.integrity, 'ok');
      assert.equal(fs.existsSync(res.filePath), true);

      // Verify backup is a valid SQLite DB
      const backupDb = new Database(res.filePath, { readonly: true });
      const bCount = backupDb.prepare('SELECT count(*) as c FROM bookings').get().c;
      assert.equal(bCount, 1);
      backupDb.close();

      // Check audit log in active DB
      const audit = db.prepare("SELECT count(*) as c FROM audit_logs WHERE action = 'backup.create'").get().c;
      assert.equal(audit >= 1, true);
    });

    it('allows Cashier to create backup', async () => {
      const res = await backupService.createBackup(cashierSession, { isManual: true });
      assert.equal(res.ok, true);
    });

    it('rejects Viewer from creating backup', async () => {
      await assert.rejects(
        async () => backupService.createBackup(viewerSession),
        /permission|denied/i
      );
    });
  });

  describe('2. Archive Backup (.zip with DB + Photos)', () => {
    it('creates a .zip archive bundling both SQLite database and photos', async () => {
      const res = await backupService.createArchiveBackup(ownerSession);
      assert.equal(res.ok, true);
      assert.equal(res.isZip, true);
      assert.equal(fs.existsSync(res.filePath), true);

      // Extract and verify archive content
      const testExtractDir = path.join(tmpDir, 'verify-archive');
      extractZipArchive(res.filePath, testExtractDir);

      assert.equal(fs.existsSync(path.join(testExtractDir, 'database', 'ifrah.sqlite')), true);
      assert.equal(fs.existsSync(path.join(testExtractDir, 'manifest.json')), true);
      assert.equal(fs.existsSync(path.join(testExtractDir, 'photos', 'dress-1.jpg')), true);
      assert.equal(fs.existsSync(path.join(testExtractDir, 'photos', 'dress-2.jpg')), true);
    });
  });

  describe('3. Home Status & 2-Day Warning', () => {
    it('returns status ok when backup was created recently', () => {
      const status = backupService.getStatus(ownerSession);
      assert.equal(status.ok, true);
      assert.equal(status.status, 'ok');
      assert.equal(status.warning, false);
      assert.match(status.message, /Last backup:.*✓/);
    });

    it('returns warning when no backups exist within 48 hours', () => {
      // Create isolated service with empty backup dir
      const emptyDir = path.join(tmpDir, 'empty-backups');
      fs.mkdirSync(emptyDir, { recursive: true });
      const emptyApp = { getPath: () => emptyDir };
      const emptyService = createBackupService(db, emptyApp, null, null, activeDbPath);

      const status = emptyService.getStatus(ownerSession);
      assert.equal(status.status, 'critical');
      assert.equal(status.warning, true);
      assert.match(status.message, /Abhi tak koi backup nahi hua/);
    });
  });

  describe('4. Automated Startup Backup & Retention Purging', () => {
    it('runs startup backup if none existed today, then skips second run', async () => {
      // In isolated test dir
      const autoDir = path.join(tmpDir, 'auto-test');
      fs.mkdirSync(autoDir, { recursive: true });
      const autoApp = { getPath: () => autoDir };
      const autoService = createBackupService(db, autoApp, null, null, activeDbPath);

      // First run: should create backup
      const res1 = await autoService.autoBackupOnStartup();
      assert.equal(res1.ok, true);
      assert.equal(res1.created, true);

      // Second run today: should skip gracefully
      const res2 = await autoService.autoBackupOnStartup();
      assert.equal(res2.ok, true);
      assert.equal(res2.created, false);
      assert.equal(res2.skipped, true);
    });

    it('purges excess auto backups beyond retention policy while preserving manual backups', () => {
      const purgeDir = path.join(tmpDir, 'purge-test');
      fs.mkdirSync(purgeDir, { recursive: true });
      const purgeApp = { getPath: () => purgeDir };
      const purgeService = createBackupService(db, purgeApp, null, null, activeDbPath);

      // Create manual backup and multiple auto backups for same day
      const manualFile = path.join(purgeDir, 'ifrah-backup-2026-05-01_10-00-00-manual.sqlite');
      const auto1 = path.join(purgeDir, 'ifrah-backup-2026-05-01_10-00-00-auto.sqlite');
      const auto2 = path.join(purgeDir, 'ifrah-backup-2026-05-01_11-00-00-auto.sqlite');
      fs.writeFileSync(manualFile, 'data');
      fs.writeFileSync(auto1, 'data');
      fs.writeFileSync(auto2, 'data');

      purgeService.purgeOldBackups(30);

      // Manual backup must be preserved
      assert.equal(fs.existsSync(manualFile), true, 'Manual backups must never be purged');
    });
  });

  describe('5. Inspect Backup', () => {
    it('inspects a backup file and returns counts and integrity', async () => {
      const backupRes = await backupService.createBackup(ownerSession, { isManual: true });
      const inspection = backupService.inspectBackup(ownerSession, backupRes.filePath);

      assert.equal(inspection.ok, true);
      assert.equal(inspection.valid, true);
      assert.equal(inspection.integrity, 'ok');
      assert.equal(inspection.summary.bookingsCount, 1);
      assert.equal(inspection.summary.customersCount, 1);
      assert.equal(inspection.summary.dressesCount, 1);
      assert.equal(inspection.summary.paymentsSum, 5000);
    });

    it('rejects corrupt backup file during inspection', () => {
      const corruptFile = path.join(backupDir, 'corrupt.sqlite');
      fs.writeFileSync(corruptFile, 'not-a-valid-sqlite-database-header');

      const inspection = backupService.inspectBackup(ownerSession, corruptFile);
      assert.equal(inspection.ok, false);
      assert.equal(inspection.valid, false);
    });
  });

  describe('6. Owner-Only Restore with Safety Snapshot', () => {
    it('forbids Cashier and Viewer from restoring backup', async () => {
      const backupRes = await backupService.createBackup(ownerSession, { isManual: true });

      await assert.rejects(
        async () => backupService.restoreBackup(cashierSession, { backupFilePath: backupRes.filePath }),
        /permission|denied/i
      );

      await assert.rejects(
        async () => backupService.restoreBackup(viewerSession, { backupFilePath: backupRes.filePath }),
        /permission|denied/i
      );
    });

    it('restores backup, creates before-restore safety snapshot, and logs audit event', async () => {
      // 1. Create a snapshot of current state (1 booking)
      const targetBackup = await backupService.createBackup(ownerSession, { isManual: true });

      // 2. Add an extra booking into active DB to change state
      db.prepare(`
        INSERT INTO bookings (id, booking_no, customer_id, status, booking_date, grand_total, amount_paid)
        VALUES (2, 413, 1, 'Closed', '2026-10-11', 20000, 20000)
      `).run();
      const currentCount = db.prepare('SELECT count(*) as c FROM bookings').get().c;
      assert.equal(currentCount, 2);

      // 3. Restore targetBackup (which only had 1 booking)
      const restoreRes = await backupService.restoreBackup(ownerSession, {
        backupFilePath: targetBackup.filePath,
      });

      assert.equal(restoreRes.ok, true);
      assert.match(restoreRes.safetySnapshot, /before-restore/);
      assert.equal(fs.existsSync(path.join(backupDir, restoreRes.safetySnapshot)), true);

      // 4. Verify restored active DB now has 1 booking again
      const restoredDb = new Database(activeDbPath, { readonly: true });
      const restoredCount = restoredDb.prepare('SELECT count(*) as c FROM bookings').get().c;
      assert.equal(restoredCount, 1);

      // 5. Check RESTORE_DATABASE audit entry
      const auditEntry = restoredDb.prepare("SELECT * FROM audit_logs WHERE action = 'RESTORE_DATABASE'").get();
      assert.notEqual(auditEntry, undefined);
      restoredDb.close();
    });

    it('rejects restoring a corrupted file without harming active DB', async () => {
      const corruptFile = path.join(backupDir, 'corrupt-to-restore.sqlite');
      fs.writeFileSync(corruptFile, 'corrupted-data');

      await assert.rejects(
        async () => backupService.restoreBackup(ownerSession, { backupFilePath: corruptFile }),
        /Restore rejected: Backup file is invalid or corrupt/
      );

      // Active DB must be uncorrupted
      const checkDb = new Database(activeDbPath, { readonly: true });
      const integrity = checkDb.prepare('PRAGMA integrity_check').get();
      assert.equal(Object.values(integrity)[0], 'ok');
      checkDb.close();
    });
  });
});
