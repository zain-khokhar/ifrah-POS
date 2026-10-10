/**
 * electron/backup/service.js
 *
 * Local database backup service for Ifrah Collection POS.
 *
 * Features:
 *  - Native SQLite online backup API via better-sqlite3 (db.backup).
 *  - Runs PRAGMA integrity_check to verify uncorrupted snapshot.
 *  - Saves to default backups directory (userData/backups) or custom location.
 *  - Interactive save dialog for manual backup to USB, Desktop, or custom folder.
 *  - Lists existing backups with file size, timestamp, and status.
 *  - Writes audit trail for every backup created.
 */

const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { requireRole, ROLES } = require('../auth/roles');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
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

function createBackupService(db, electronApp = null, electronDialog = null, electronShell = null) {
  function getDefaultBackupDir() {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return path.join(electronApp.getPath('userData'), 'backups');
    }
    return path.join(process.cwd(), 'backups');
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

    // If destination already exists, remove it first
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }

    // Run SQLite online backup
    if (typeof db.backup === 'function') {
      await db.backup(destPath);
    } else {
      // Fallback: VACUUM INTO
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
    const user = session.user;

    const timestamp = getTimestamp();
    const typeLabel = isManual ? 'manual' : 'auto';
    const defaultFilename = `ifrah-backup-${timestamp}-${typeLabel}.sqlite`;

    const destPath = customPath || path.join(getDefaultBackupDir(), defaultFilename);
    return await performBackupToFile(destPath, user);
  }

  // ─── Interactive Save Dialog Backup ───────────────────────────────────────
  async function chooseAndSaveBackup(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    const timestamp = getTimestamp();
    const defaultFilename = `ifrah-backup-${timestamp}-manual.sqlite`;

    if (!electronDialog) {
      // In non-GUI/headless environment, use default path
      return await createBackup(session, { isManual: true });
    }

    const { canceled, filePath } = await electronDialog.showSaveDialog({
      title: 'Manual Database Backup Save Karein',
      defaultPath: path.join(getDefaultBackupDir(), defaultFilename),
      filters: [
        { name: 'SQLite Database', extensions: ['sqlite', 'db'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { ok: false, canceled: true, message: 'Backup cancel kar diya gaya.' };
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
      if (file.endsWith('.sqlite') || file.endsWith('.db')) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
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
            type: file.includes('manual') ? 'manual' : 'auto',
          });
        } catch {
          // skip inaccessible file
        }
      }
    }

    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return backups;
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
    chooseAndSaveBackup,
    listBackups,
    openBackupFolder,
    getDefaultBackupDir,
  };
}

module.exports = {
  createBackupService,
};
