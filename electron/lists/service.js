/**
 * electron/lists/service.js
 *
 * CRUD service for all learning-dropdown lists:
 *   cities, casts, relation_types, dress_categories
 *
 * Rules (plans/claude.md §3 Phase 3):
 *  - Type a new value → 'Add "xyz"' option → saved instantly.
 *  - Duplicate check ignores case, spaces and punctuation (normalizeName).
 *  - Owner can rename and disable entries in Settings (rename + soft-delete).
 *  - These are the only tables touched here; bookings etc. are in other services.
 */

const { normalizeName } = require('../domain/normalize');
const { withAudit }     = require('../auth/audit');
const { requireRole, ROLES } = require('../auth/roles');

// Map public table names → actual SQLite table names (safety whitelist)
const ALLOWED_TABLES = Object.freeze({
  cities:          'cities',
  casts:           'casts',
  relation_types:  'relation_types',
  dress_categories:'dress_categories',
});

function createListsService(db) {
  // ─── SEED ───────────────────────────────────────────────────────────────
  /**
   * Idempotent: insert a value only if the normalized form doesn't exist.
   * Used at startup to pre-populate relation types, categories, etc.
   */
  function seedIfMissing(tableName, names) {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO ${tableName} (name, name_normalized)
       VALUES (?, ?)`
    );
    const seedAll = db.transaction(() => {
      for (const name of names) {
        stmt.run(name.trim(), normalizeName(name));
      }
    });
    seedAll();
  }

  // ─── LIST (for dropdowns) ────────────────────────────────────────────────
  /**
   * Returns all active entries for a dropdown, alphabetically sorted.
   * No auth required — viewers can see dropdown options.
   */
  function list(tableName) {
    validateTable(tableName);
    return db.prepare(
      `SELECT id, name FROM ${tableName}
       WHERE deleted_at IS NULL
       ORDER BY name COLLATE NOCASE`
    ).all();
  }

  // ─── ADD (learning: add if not duplicate) ───────────────────────────────
  /**
   * Adds a new entry.  If the normalized form already exists (even soft-deleted),
   * returns the existing row so the UI can reuse it rather than creating a copy.
   * Owner and Cashier may add; Viewer cannot.
   */
  function add(session, tableName, name) {
    validateTable(tableName);
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    const trimmed  = String(name || '').trim();
    if (!trimmed) throw new Error('Name cannot be empty.');

    const normalized = normalizeName(trimmed);

    // Check for duplicate (including disabled)
    const existing = db.prepare(
      `SELECT id, name, deleted_at FROM ${tableName} WHERE name_normalized = ?`
    ).get(normalized);

    if (existing && existing.deleted_at === null) {
      // Active duplicate — return existing so caller can use it
      return { id: existing.id, name: existing.name, alreadyExisted: true };
    }

    if (existing && existing.deleted_at !== null) {
      // Re-activate a previously disabled entry
      const result = withAudit(db, user, `${tableName}.reactivate`, tableName, existing.id,
        { oldValues: { deleted_at: existing.deleted_at }, newValues: { deleted_at: null, name: trimmed } },
        () => db.prepare(
          `UPDATE ${tableName} SET name = ?, name_normalized = ?, deleted_at = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
        ).run(trimmed, normalized, existing.id)
      );
      return { id: existing.id, name: trimmed, reactivated: true };
    }

    // Brand new entry
    const result = withAudit(db, user, `${tableName}.create`, tableName,
      r => r.lastInsertRowid,
      { newValues: { name: trimmed } },
      () => db.prepare(
        `INSERT INTO ${tableName} (name, name_normalized) VALUES (?, ?)`
      ).run(trimmed, normalized)
    );
    return { id: result.lastInsertRowid, name: trimmed };
  }

  // ─── RENAME (Owner only) ─────────────────────────────────────────────────
  function rename(session, tableName, id, newName) {
    validateTable(tableName);
    const user = requireRole(session, [ROLES.OWNER]);

    const trimmed    = String(newName || '').trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    const normalized = normalizeName(trimmed);

    // Check conflict with a different row
    const conflict = db.prepare(
      `SELECT id FROM ${tableName} WHERE name_normalized = ? AND id != ? AND deleted_at IS NULL`
    ).get(normalized, id);
    if (conflict) throw new Error(`"${trimmed}" already exists in the list.`);

    const old = db.prepare(`SELECT name FROM ${tableName} WHERE id = ?`).get(id);
    withAudit(db, user, `${tableName}.rename`, tableName, id,
      { oldValues: { name: old?.name }, newValues: { name: trimmed } },
      () => db.prepare(
        `UPDATE ${tableName} SET name = ?, name_normalized = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
      ).run(trimmed, normalized, id)
    );
    return { ok: true };
  }

  // ─── DISABLE (Owner only, soft delete) ──────────────────────────────────
  function disable(session, tableName, id) {
    validateTable(tableName);
    const user = requireRole(session, [ROLES.OWNER]);

    const old = db.prepare(`SELECT name FROM ${tableName} WHERE id = ?`).get(id);
    withAudit(db, user, `${tableName}.disable`, tableName, id,
      { oldValues: { deleted_at: null }, newValues: { deleted_at: 'soft-deleted' } },
      () => db.prepare(
        `UPDATE ${tableName}
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND deleted_at IS NULL`
      ).run(id)
    );
    return { ok: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function validateTable(tableName) {
    if (!ALLOWED_TABLES[tableName]) {
      throw new Error(`Unknown list table: "${tableName}".`);
    }
  }

  return { seedIfMissing, list, add, rename, disable };
}

module.exports = { createListsService };
