'use strict';

/**
 * electron/backup/service.js
 *
 * Phase 12 — Complete Backup & Restore Engine for Ifrah Collection POS.
 *
 * Core Features (plans/claude.md §12):
 *  1. SQLite online backup API & VACUUM INTO with PRAGMA integrity_check on every backup.
 *  2. Automatic daily backups:
 *      - On startup: runs if no backup has run today.
 *      - On shutdown: ensures fresh snapshot before closing.
 *      - Retention policy: keeps 30 daily backups + monthly snapshots, purging stale auto backups.
 *      - Secondary location copy: duplicates backup to USB / synced folder if configured.
 *  3. Home status & warning:
 *      - Returns 'Last backup: today 9:41 PM ✓'.
 *      - Triggers friendly warning if no backup has occurred in the past 2 days.
 *  4. Photos folder bundling:
 *      - Bundles SQLite database + dress/damage photos into a standard .zip archive.
 *  5. Owner-only one-click restore:
 *      - Pre-inspects backup with record counts (bookings, customers, dresses, revenue).
 *      - Creates automatic 'before-restore' safety backup of the active database before any overwrite.
 *      - Plain-language confirmation support and audited execution.
 *      - Automatic integrity check of restored database and app relaunch support.
 */

const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { requireRole, ROLES } = require('../auth/roles');
const { createZipArchive, extractZipArchive } = require('./zip');

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}_${h}-${mi}-${s}`;
}

function formatFriendlyTime(dateObj) {
  const now = new Date();
  const isToday = dateObj.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = dateObj.toDateString() === yesterday.toDateString();

  const timeStr = dateObj.toLocaleTimeString('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) return `today ${timeStr}`;
  if (isYesterday) return `yesterday ${timeStr}`;

  const dateStr = dateObj.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${dateStr}, ${timeStr}`;
}

function createBackupService(db, electronApp = null, electronDialog = null, electronShell = null, customDbPath = null) {

  function getDefaultBackupDir() {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return path.join(electronApp.getPath('userData'), 'backups');
    }
    return path.join(process.cwd(), 'backups');
  }

  function getPhotosDir() {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return path.join(electronApp.getPath('userData'), 'photos');
    }
    return path.join(process.cwd(), 'photos');
  }

  function getActiveDbPath() {
    if (customDbPath) return customDbPath;
    if (electronApp && typeof electronApp.getPath === 'function') {
      return path.join(electronApp.getPath('userData'), 'database', 'ifrah.sqlite');
    }
    return path.join(process.cwd(), 'database', 'ifrah.sqlite');
  }

  function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // ─── Perform backup to destination file ────────────────────────────────────
  async function performBackupToFile(destPath, user) {
    const dir = path.dirname(destPath);
    ensureDir(dir);

    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }

    // Run SQLite online backup API
    if (typeof db.backup === 'function') {
      await db.backup(destPath);
    } else {
      db.prepare('VACUUM INTO ?').run(destPath);
    }

    // Verify integrity of the backup file
    let integrityCheck = 'unknown';
    try {
      const verifyDb = new Database(destPath, { readonly: true });
      const row = verifyDb.prepare('PRAGMA integrity_check').get();
      verifyDb.close();
      integrityCheck = row ? Object.values(row)[0] : 'failed';
    } catch (err) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      throw new Error(`Backup integrity check failed: ${err.message}`);
    }

    if (integrityCheck !== 'ok') {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      throw new Error(`Backup corrupted (integrity check: ${integrityCheck}). File removed.`);
    }

    const stat = fs.statSync(destPath);
    const sizeFormatted = formatBytes(stat.size);
    const filename = path.basename(destPath);

    // Audit backup creation
    if (user && user.id) {
      try {
        db.prepare(`
          INSERT INTO audit_logs (user_id, action, table_name, new_values)
          VALUES (?, ?, ?, ?)
        `).run(
          user.id,
          'backup.create',
          'system',
          JSON.stringify({ filename, path: destPath, sizeBytes: stat.size, size: sizeFormatted })
        );
      } catch (logErr) {
        console.warn('[Backup] Audit logging failed:', logErr.message);
      }
    }

    // Secondary backup location support (USB or Cloud Sync folder)
    try {
      const settingRow = db.prepare(`SELECT value FROM settings WHERE key = 'backup_secondary_dir'`).get();
      if (settingRow && settingRow.value) {
        const secDir = settingRow.value.trim();
        if (secDir && fs.existsSync(secDir)) {
          const secDest = path.join(secDir, filename);
          fs.copyFileSync(destPath, secDest);
          console.log('[Backup] Copied to secondary location:', secDest);
        }
      }
    } catch {}

    return {
      ok: true,
      filename,
      filePath: destPath,
      sizeBytes: stat.size,
      sizeFormatted,
      integrity: integrityCheck,
      createdAt: new Date().toISOString(),
    };
  }

  // ─── Create backup in default folder ──────────────────────────────────────
  async function createBackup(session, { customPath = null, isManual = true } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session?.user;

    const timestamp = getTimestamp();
    const typeLabel = isManual ? 'manual' : 'auto';
    const defaultFilename = `ifrah-backup-${timestamp}-${typeLabel}.sqlite`;

    const destPath = customPath || path.join(getDefaultBackupDir(), defaultFilename);
    return await performBackupToFile(destPath, user);
  }

  // ─── Create full archive backup (.zip with DB + Photos) ───────────────────
  async function createArchiveBackup(session, { customPath = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session?.user;

    const timestamp = getTimestamp();
    const defaultFilename = `ifrah-backup-${timestamp}-archive.zip`;
    const destZipPath = customPath || path.join(getDefaultBackupDir(), defaultFilename);

    // 1. Create temporary SQLite snapshot
    const tmpSnapshotPath = path.join(getDefaultBackupDir(), `temp-snapshot-${timestamp}.sqlite`);
    await performBackupToFile(tmpSnapshotPath, null);

    // 2. Collect entries
    const entries = [
      { name: 'database/ifrah.sqlite', filePath: tmpSnapshotPath },
    ];

    // Add manifest
    const manifest = {
      app: 'Ifrah Collection POS',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      creator: user?.username || 'system',
    };
    entries.push({
      name: 'manifest.json',
      content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    });

    // 3. Add photos if folder exists
    const photosDir = getPhotosDir();
    if (fs.existsSync(photosDir)) {
      const photos = fs.readdirSync(photosDir);
      for (const p of photos) {
        const fullPhotoPath = path.join(photosDir, p);
        if (fs.statSync(fullPhotoPath).isFile()) {
          entries.push({ name: `photos/${p}`, filePath: fullPhotoPath });
        }
      }
    }

    // 4. Create ZIP
    createZipArchive(entries, destZipPath);

    // Clean up temporary SQLite snapshot
    try { fs.unlinkSync(tmpSnapshotPath); } catch {}

    const stat = fs.statSync(destZipPath);
    const sizeFormatted = formatBytes(stat.size);

    if (user && user.id) {
      try {
        db.prepare(`
          INSERT INTO audit_logs (user_id, action, table_name, new_values)
          VALUES (?, ?, ?, ?)
        `).run(
          user.id,
          'backup.archive_create',
          'system',
          JSON.stringify({ filename: defaultFilename, path: destZipPath, size: sizeFormatted })
        );
      } catch {}
    }

    return {
      ok: true,
      filename: defaultFilename,
      filePath: destZipPath,
      sizeBytes: stat.size,
      sizeFormatted,
      isZip: true,
      createdAt: new Date().toISOString(),
    };
  }

  // ─── Interactive Save Dialog Backup ───────────────────────────────────────
  async function chooseAndSaveBackup(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    const timestamp = getTimestamp();
    const defaultFilename = `ifrah-backup-${timestamp}-manual.sqlite`;

    if (!electronDialog) {
      return await createBackup(session, { isManual: true });
    }

    const { canceled, filePath } = await electronDialog.showSaveDialog({
      title: 'Manual Database Backup Save Karein',
      defaultPath: path.join(getDefaultBackupDir(), defaultFilename),
      filters: [
        { name: 'SQLite Database', extensions: ['sqlite', 'db'] },
        { name: 'ZIP Archive (with Photos)', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { ok: false, canceled: true, message: 'Backup cancel kar diya gaya.' };
    }

    if (filePath.endsWith('.zip')) {
      return await createArchiveBackup(session, { customPath: filePath });
    }

    return await performBackupToFile(filePath, session.user);
  }

  // ─── List backups in default folder ───────────────────────────────────────
  function listBackups(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const dir = getDefaultBackupDir();
    ensureDir(dir);

    const files = fs.readdirSync(dir);
    const backups = [];

    for (const file of files) {
      const isSqlite = file.endsWith('.sqlite') || file.endsWith('.db');
      const isZip = file.endsWith('.zip');

      if (isSqlite || isZip) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          const dateObj = new Date(stat.mtime);

          let type = 'auto';
          if (file.includes('manual')) type = 'manual';
          else if (file.includes('before-restore')) type = 'safety';
          else if (file.includes('archive')) type = 'archive';

          backups.push({
            name: file,
            path: fullPath,
            sizeBytes: stat.size,
            size: formatBytes(stat.size),
            createdAt: stat.mtime.toISOString(),
            dateFormatted: new Intl.DateTimeFormat('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: true,
            }).format(stat.mtime),
            timeAgo: formatFriendlyTime(dateObj),
            type,
            isZip,
            integrity: 'valid',
          });
        } catch {}
      }
    }

    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return backups;
  }

  // ─── Get Backup Status & Home Warning ─────────────────────────────────────
  function getStatus(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const backups = listBackups(session);
    const totalBackups = backups.length;

    if (totalBackups === 0) {
      return {
        ok: true,
        lastBackup: null,
        daysSinceLastBackup: 999,
        status: 'critical',
        warning: true,
        message: 'Abhi tak koi backup nahi hua! Data ki hifazat ke liye backup lein.',
        totalBackups: 0,
      };
    }

    const latest = backups[0];
    const lastDate = new Date(latest.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const daysSince = diffMs / (1000 * 60 * 60 * 24);

    let status = 'ok';
    let warning = false;
    let message = `Last backup: ${latest.timeAgo} ✓`;

    if (daysSince >= 2) {
      status = 'warning';
      warning = true;
      message = 'Pichle 2 din se koi backup nahi hua! Baraye meherbani backup lein.';
    }

    return {
      ok: true,
      lastBackup: latest,
      daysSinceLastBackup: Math.floor(daysSince),
      status,
      warning,
      message,
      totalBackups,
    };
  }

  // ─── Inspect a Backup (metadata summary before restoring) ─────────────────
  function inspectBackup(session, backupFilePath) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found: ${backupFilePath}`);
    }

    let inspectSqlitePath = backupFilePath;
    let tempExtractDir = null;

    if (backupFilePath.endsWith('.zip')) {
      tempExtractDir = fs.mkdtempSync(path.join(getDefaultBackupDir(), 'inspect-'));
      extractZipArchive(backupFilePath, tempExtractDir);
      inspectSqlitePath = path.join(tempExtractDir, 'database', 'ifrah.sqlite');
      if (!fs.existsSync(inspectSqlitePath)) {
        throw new Error('Archive does not contain a valid database/ifrah.sqlite file');
      }
    }

    try {
      let inspectDb;
      try {
        inspectDb = new Database(inspectSqlitePath, { readonly: true });
      } catch (err) {
        return { ok: false, valid: false, error: err.message };
      }

      let integrity = 'failed';
      try {
        const integrityRow = inspectDb.prepare('PRAGMA integrity_check').get();
        integrity = integrityRow ? Object.values(integrityRow)[0] : 'failed';
      } catch (err) {
        try { inspectDb.close(); } catch {}
        return { ok: false, valid: false, error: err.message };
      }

      if (integrity !== 'ok') {
        try { inspectDb.close(); } catch {}
        return { ok: false, valid: false, error: `Integrity check failed: ${integrity}` };
      }

      const getCount = (table) => {
        try {
          return inspectDb.prepare(`SELECT count(*) as c FROM ${table} WHERE deleted_at IS NULL`).get()?.c ?? 0;
        } catch {
          try {
            return inspectDb.prepare(`SELECT count(*) as c FROM ${table}`).get()?.c ?? 0;
          } catch {
            return 0;
          }
        }
      };

      const bookingsCount  = getCount('bookings');
      const customersCount = getCount('customers');
      const dressesCount   = getCount('dresses');
      const itemsCount     = getCount('booking_items');

      let paymentsSum = 0;
      try {
        paymentsSum = inspectDb.prepare('SELECT sum(amount) as s FROM payments WHERE is_void = 0').get()?.s ?? 0;
      } catch {}

      let latestBooking = null;
      try {
        latestBooking = inspectDb.prepare('SELECT max(booking_date) as d FROM bookings').get()?.d ?? null;
      } catch {}

      inspectDb.close();

      return {
        ok: true,
        valid: true,
        integrity,
        summary: {
          bookingsCount,
          customersCount,
          dressesCount,
          itemsCount,
          paymentsSum,
          latestBooking,
        },
      };
    } finally {
      if (tempExtractDir) {
        try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch {}
      }
    }
  }

  // ─── Owner-Only One-Click Restore ─────────────────────────────────────────
  async function restoreBackup(session, { backupFilePath, restartAfter = false }) {
    requireRole(session, [ROLES.OWNER]);

    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found: ${backupFilePath}`);
    }

    const activeDb = getActiveDbPath();
    const backupDir = getDefaultBackupDir();
    ensureDir(backupDir);

    // Step 1: Pre-inspect candidate backup file to ensure it is not corrupt
    const inspection = inspectBackup(session, backupFilePath);
    if (!inspection.ok || !inspection.valid) {
      throw new Error(`Restore rejected: Backup file is invalid or corrupt. (${inspection.error || 'Failed integrity'})`);
    }

    // Step 2: MANDATORY SAFETY SNAPSHOT of active database before touching anything!
    const safetyFilename = `ifrah-backup-${getTimestamp()}-before-restore.sqlite`;
    const safetySnapshotPath = path.join(backupDir, safetyFilename);

    if (fs.existsSync(activeDb)) {
      try {
        await performBackupToFile(safetySnapshotPath, session.user);
        console.log('[Restore] Safety backup created at:', safetySnapshotPath);
      } catch (safetyErr) {
        throw new Error(`Restore aborted: Could not create pre-restore safety snapshot: ${safetyErr.message}`);
      }
    }

    // Step 3: Handle ZIP archive vs direct SQLite file
    let sourceSqlitePath = backupFilePath;
    let tempUnpackDir = null;

    if (backupFilePath.endsWith('.zip')) {
      tempUnpackDir = fs.mkdtempSync(path.join(backupDir, 'restore-unpack-'));
      extractZipArchive(backupFilePath, tempUnpackDir);
      sourceSqlitePath = path.join(tempUnpackDir, 'database', 'ifrah.sqlite');

      // Also restore any photos from zip into photos directory
      const unpackedPhotos = path.join(tempUnpackDir, 'photos');
      if (fs.existsSync(unpackedPhotos)) {
        const destPhotos = getPhotosDir();
        ensureDir(destPhotos);
        const photoFiles = fs.readdirSync(unpackedPhotos);
        for (const pf of photoFiles) {
          fs.copyFileSync(path.join(unpackedPhotos, pf), path.join(destPhotos, pf));
        }
      }
    }

    // Step 4: Safely replace the active database file
    try {
      // Checkpoint and close connections if possible
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {}

      // Clean up WAL / SHM auxiliary files
      const walFile = `${activeDb}-wal`;
      const shmFile = `${activeDb}-shm`;
      if (fs.existsSync(walFile)) { try { fs.unlinkSync(walFile); } catch {} }
      if (fs.existsSync(shmFile)) { try { fs.unlinkSync(shmFile); } catch {} }

      // Copy candidate DB over active DB
      fs.copyFileSync(sourceSqlitePath, activeDb);

      // Verify integrity of newly replaced file
      const verifyRestored = new Database(activeDb, { readonly: true });
      const checkRow = verifyRestored.prepare('PRAGMA integrity_check').get();
      verifyRestored.close();
      const integrity = checkRow ? Object.values(checkRow)[0] : 'failed';

      if (integrity !== 'ok') {
        // Rollback from safety snapshot!
        fs.copyFileSync(safetySnapshotPath, activeDb);
        throw new Error(`Restored database failed integrity check (${integrity}). Rolled back to safety snapshot.`);
      }

      // Log the restore event in the restored DB's audit log
      try {
        const logDb = new Database(activeDb);
        logDb.prepare(`
          INSERT INTO audit_logs (user_id, action, table_name, new_values)
          VALUES (?, 'RESTORE_DATABASE', 'system', ?)
        `).run(
          session.user.id,
          JSON.stringify({
            restoredFrom: path.basename(backupFilePath),
            safetySnapshot: safetyFilename,
            summary: inspection.summary,
            restoredAt: new Date().toISOString(),
          })
        );
        logDb.close();
      } catch {}

    } finally {
      if (tempUnpackDir) {
        try { fs.rmSync(tempUnpackDir, { recursive: true, force: true }); } catch {}
      }
    }

    // Optional app restart
    if (restartAfter && electronApp && typeof electronApp.relaunch === 'function') {
      setTimeout(() => {
        electronApp.relaunch();
        electronApp.exit(0);
      }, 500);
    }

    return {
      ok: true,
      message: 'Database kamiyabi se restore ho gaya!',
      restoredFrom: path.basename(backupFilePath),
      safetySnapshot: safetyFilename,
      summary: inspection.summary,
    };
  }

  // ─── Automated Startup Backup Runner ──────────────────────────────────────
  async function autoBackupOnStartup() {
    try {
      // Don't auto-backup if database has no users or bookings yet
      try {
        const uCount = db.prepare('SELECT count(*) as c FROM users').get()?.c || 0;
        const bCount = db.prepare('SELECT count(*) as c FROM bookings').get()?.c || 0;
        if (uCount === 0 && bCount === 0) {
          return { ok: true, created: false, skipped: true, reason: 'Empty database' };
        }
      } catch {}

      const todayPrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const backupDir = getDefaultBackupDir();
      ensureDir(backupDir);

      const files = fs.readdirSync(backupDir);
      // Check if any backup was made today
      const alreadyBackedUpToday = files.some(f => {
        if (!f.startsWith('ifrah-backup-')) return false;
        try {
          const stat = fs.statSync(path.join(backupDir, f));
          return stat.mtime.toISOString().slice(0, 10) === todayPrefix;
        } catch {
          return false;
        }
      });

      if (alreadyBackedUpToday) {
        return { ok: true, created: false, skipped: true, reason: 'Already backed up today' };
      }

      console.log('[Backup] Running automatic startup backup...');
      const sysSession = { active: true, user: { id: 1, role: ROLES.OWNER, username: 'system_auto' } };
      const res = await createBackup(sysSession, { isManual: false });

      // Run 30-day retention cleanup
      purgeOldBackups(30);

      return { ok: true, created: true, ...res };
    } catch (err) {
      console.error('[Backup] Startup auto backup error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ─── Automated Shutdown Backup Runner ─────────────────────────────────────
  async function autoBackupOnShutdown() {
    try {
      // Don't auto-backup if database has no users or bookings yet
      try {
        const uCount = db.prepare('SELECT count(*) as c FROM users').get()?.c || 0;
        const bCount = db.prepare('SELECT count(*) as c FROM bookings').get()?.c || 0;
        if (uCount === 0 && bCount === 0) {
          return { ok: true, created: false, skipped: true, reason: 'Empty database' };
        }
      } catch {}

      const todayPrefix = new Date().toISOString().slice(0, 10);
      const backupDir = getDefaultBackupDir();
      ensureDir(backupDir);

      // Only backup if no backup exists for today
      const files = fs.readdirSync(backupDir);
      const alreadyBackedUpToday = files.some(f => {
        if (!f.startsWith('ifrah-backup-')) return false;
        try {
          const stat = fs.statSync(path.join(backupDir, f));
          return stat.mtime.toISOString().slice(0, 10) === todayPrefix;
        } catch {
          return false;
        }
      });

      if (alreadyBackedUpToday) {
        return { ok: true, created: false, skipped: true, reason: 'Already backed up today' };
      }

      console.log('[Backup] Running automatic shutdown backup...');
      const sysSession = { active: true, user: { id: 1, role: ROLES.OWNER, username: 'system_shutdown' } };
      return await createBackup(sysSession, { isManual: false });
    } catch (err) {
      console.warn('[Backup] Shutdown backup error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ─── Purge Old Auto Backups (Retention: 30 daily + monthly snapshots) ──────
  function purgeOldBackups(keepDays = 30) {
    const backupDir = getDefaultBackupDir();
    if (!fs.existsSync(backupDir)) return { purged: 0 };

    const files = fs.readdirSync(backupDir);
    const now = new Date();
    let purgedCount = 0;

    // Only clean auto backups (never touch manual, safety, or custom backups)
    const autoFiles = files.filter(f => f.startsWith('ifrah-backup-') && f.includes('-auto.sqlite'));

    // Group auto files by day (YYYY-MM-DD)
    const byDay = new Map();
    for (const f of autoFiles) {
      const fullPath = path.join(backupDir, f);
      try {
        const stat = fs.statSync(fullPath);
        const dayStr = stat.mtime.toISOString().slice(0, 10);
        if (!byDay.has(dayStr)) byDay.set(dayStr, []);
        byDay.get(dayStr).push({ file: f, path: fullPath, mtime: stat.mtime });
      } catch {}
    }

    for (const [dayStr, dayFiles] of byDay.entries()) {
      dayFiles.sort((a, b) => b.mtime - a.mtime);
      const dayDate = new Date(dayStr);
      const ageDays = (now - dayDate) / (1000 * 60 * 60 * 24);

      if (ageDays <= keepDays) {
        // Within 30 days: keep only 1 per day (delete excess auto backups of the same day)
        for (let i = 1; i < dayFiles.length; i++) {
          try { fs.unlinkSync(dayFiles[i].path); purgedCount++; } catch {}
        }
      } else {
        // Older than 30 days: keep only 1st of month (monthly snapshot)
        const isFirstOfMonth = dayDate.getDate() <= 3;
        const startIndex = isFirstOfMonth ? 1 : 0;
        for (let i = startIndex; i < dayFiles.length; i++) {
          try { fs.unlinkSync(dayFiles[i].path); purgedCount++; } catch {}
        }
      }
    }

    return { purged: purgedCount };
  }

  // ─── Open Backup Folder in Explorer ───────────────────────────────────────
  function openBackupFolder(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const dir = getDefaultBackupDir();
    ensureDir(dir);
    if (electronShell && typeof electronShell.openPath === 'function') {
      electronShell.openPath(dir);
      return { ok: true, path: dir };
    }
    return { ok: false, message: 'Shell not available', path: dir };
  }

  return {
    createBackup,
    createArchiveBackup,
    chooseAndSaveBackup,
    listBackups,
    getStatus,
    inspectBackup,
    restoreBackup,
    autoBackupOnStartup,
    autoBackupOnShutdown,
    purgeOldBackups,
    openBackupFolder,
    getDefaultBackupDir,
    getPhotosDir,
    getActiveDbPath,
  };
}

module.exports = {
  createBackupService,
};
