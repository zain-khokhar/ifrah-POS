/**
 * electron/dresses/service.js
 *
 * Dress catalogue CRUD for Ifrah Collection POS.
 *
 * Plan rules (§3 Phase 3):
 *  - Deactivate instead of delete. No hard delete.
 *  - Only Owner can change rental_price.
 *  - Photo optional: copied into userData/photos/, thumbnail made.
 *  - Similar-name suggestion when adding ('Did you mean Red Bridal Lehenga?').
 *  - Quick-add from booking screen: just name is enough.
 *  - Code auto-generated as D-NNN if not supplied.
 */

const path = require('path');
const fs   = require('fs');
const { withAudit }     = require('../auth/audit');
const { requireRole, ROLES } = require('../auth/roles');
const { normalizeName } = require('../domain/normalize');

function createDressesService(db, app) {
  // ─── Photos folder ───────────────────────────────────────────────────────
  function photosDir() {
    const dir = path.join(app.getPath('userData'), 'photos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ─── LIST ────────────────────────────────────────────────────────────────
  function list(session, { search = '', categoryId = null, activeOnly = false } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['d.deleted_at IS NULL'];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(d.name LIKE ? OR d.code LIKE ? OR dc.name LIKE ?)');
      params.push(q, q, q);
    }
    if (categoryId) { conditions.push('d.category_id = ?'); params.push(categoryId); }
    if (activeOnly) { conditions.push('d.active = 1'); }

    const where = conditions.join(' AND ');

    return db.prepare(`
      SELECT
        d.id, d.code, d.name, d.size, d.rental_price, d.description,
        d.photo_path, d.active,
        d.category_id, dc.name AS category,
        d.created_at, d.updated_at,
        (SELECT COUNT(*) FROM booking_items bi
         JOIN bookings b ON b.id = bi.booking_id
         WHERE bi.dress_id = d.id AND bi.deleted_at IS NULL AND b.deleted_at IS NULL) AS booking_count
      FROM dresses d
      LEFT JOIN dress_categories dc ON dc.id = d.category_id
      WHERE ${where}
      ORDER BY d.name COLLATE NOCASE
    `).all(...params);
  }

  // ─── GET ONE ─────────────────────────────────────────────────────────────
  function get(session, id) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
    return db.prepare(`
      SELECT d.*, dc.name AS category
      FROM dresses d
      LEFT JOIN dress_categories dc ON dc.id = d.category_id
      WHERE d.id = ? AND d.deleted_at IS NULL
    `).get(id) || null;
  }

  // ─── SIMILAR-NAME SUGGESTIONS ────────────────────────────────────────────
  /**
   * Returns up to 5 existing active dresses whose normalised name
   * contains the normalised new name (or vice-versa).
   * Used to show 'Did you mean …?' when adding a dress.
   */
  function suggestSimilar(name) {
    if (!name) return [];
    const needle = normalizeName(name);
    // Also split into individual words so 'Pink Lehenga' matches 'Pink Bridal Lehenga'
    const needleWords = name.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const all = db.prepare(
      `SELECT id, name FROM dresses WHERE deleted_at IS NULL AND active = 1`
    ).all();
    return all
      .filter(d => {
        const hay = normalizeName(d.name);
        const hayLower = d.name.toLowerCase();
        if (hay === needle) return false;
        // Full normalized string containment
        if (hay.includes(needle) || needle.includes(hay)) return true;
        // All query words present in the candidate name
        if (needleWords.length >= 2 &&
            needleWords.every(w => hayLower.includes(w))) return true;
        return false;
      })
      .slice(0, 5);
  }

  // ─── NEXT CODE ───────────────────────────────────────────────────────────
  function nextCode() {
    const row = db.prepare(
      `SELECT code FROM dresses ORDER BY id DESC LIMIT 1`
    ).get();
    if (!row) return 'D-001';
    const match = row.code.match(/D-(\d+)$/);
    const next  = match ? parseInt(match[1], 10) + 1 : 1;
    return `D-${String(next).padStart(3, '0')}`;
  }

  // ─── CREATE ──────────────────────────────────────────────────────────────
  function create(session, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    const name = String(input.name || '').trim();
    if (!name) throw new Error('Dress name is required.');

    // Only owner can set the rental price above 0
    const rentalPrice = parsePrice(input.rental_price);
    if (rentalPrice > 0 && user.role !== ROLES.OWNER) {
      throw new Error('Sirf Owner rental price set kar sakta hai.');
    }

    const code = String(input.code || '').trim() || nextCode();

    // Unique code check
    const codeExists = db.prepare(
      `SELECT id FROM dresses WHERE code = ? AND deleted_at IS NULL`
    ).get(code);
    if (codeExists) throw new Error(`Code "${code}" already exists.`);

    const photoPath = copyPhoto(input.photo_source_path, app);

    const result = withAudit(db, user, 'dress.create', 'dresses',
      r => r.lastInsertRowid,
      { newValues: { code, name, rental_price: rentalPrice, category_id: num(input.category_id) } },
      () => db.prepare(`
        INSERT INTO dresses
          (code, name, category_id, size, rental_price, description, photo_path, created_by, updated_by)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        code, name,
        num(input.category_id),
        str(input.size),
        rentalPrice,
        str(input.description),
        photoPath,
        user.id, user.id,
      )
    );
    return { id: result.lastInsertRowid, code };
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────
  function update(session, id, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    const old = get(session, id);
    if (!old) throw new Error('Dress not found.');

    const name = String(input.name || '').trim();
    if (!name) throw new Error('Dress name is required.');

    // Only owner can change rental_price
    const rentalPrice = parsePrice(input.rental_price);
    if (rentalPrice !== old.rental_price && user.role !== ROLES.OWNER) {
      throw new Error('Sirf Owner rental price badal sakta hai.');
    }

    // Handle new photo
    let photoPath = old.photo_path;
    if (input.photo_source_path) {
      photoPath = copyPhoto(input.photo_source_path, app);
    }

    withAudit(db, user, 'dress.update', 'dresses', id,
      { oldValues: { name: old.name, rental_price: old.rental_price, category_id: old.category_id },
        newValues: { name, rental_price: rentalPrice, category_id: num(input.category_id) } },
      () => db.prepare(`
        UPDATE dresses SET
          name = ?, category_id = ?, size = ?, rental_price = ?,
          description = ?, photo_path = ?, updated_by = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        name, num(input.category_id), str(input.size), rentalPrice,
        str(input.description), photoPath, user.id, id,
      )
    );
    return { ok: true };
  }

  // ─── TOGGLE ACTIVE (deactivate / reactivate) ─────────────────────────────
  function setActive(session, id, active) {
    const user = requireRole(session, [ROLES.OWNER]);
    const action = active ? 'dress.activate' : 'dress.deactivate';
    withAudit(db, user, action, 'dresses', id,
      { newValues: { active: active ? 1 : 0 } },
      () => db.prepare(
        `UPDATE dresses SET active = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND deleted_at IS NULL`
      ).run(active ? 1 : 0, id)
    );
    return { ok: true };
  }

  // ─── QUICK ADD (name only, from booking screen) ──────────────────────────
  function quickAdd(session, name) {
    return create(session, { name, rental_price: 0 });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function str(v) { return v !== undefined && v !== null && v !== '' ? String(v).trim() : null; }
  function num(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function parsePrice(v) { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }

  function copyPhoto(sourcePath, appObj) {
    if (!sourcePath) return null;
    try {
      const dir  = photosDir();
      const ext  = path.extname(sourcePath) || '.jpg';
      const dest = path.join(dir, `${Date.now()}${ext}`);
      fs.copyFileSync(sourcePath, dest);
      return dest;
    } catch (e) {
      console.warn('[Dresses] Photo copy failed:', e.message);
      return null;
    }
  }

  // ─── BOOKED HISTORY ───────────────────────────────────────────────────────
  function getHistory(session, dressId, { size = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const dress = get(session, dressId);
    if (!dress) throw new Error('Dress nahi mila.');

    let query = `
      SELECT
        b.id AS booking_id,
        b.booking_no,
        b.status,
        b.booking_date,
        b.delivery_date,
        b.returning_date,
        b.delivered_on,
        b.returned_on,
        b.grand_total,
        b.amount_paid,
        b.remaining,
        cu.id   AS customer_id,
        cu.name AS customer_name,
        cu.phone AS customer_phone,
        ci.name AS city,
        bi.id   AS item_id,
        bi.line_no,
        bi.detail_no,
        bi.size,
        bi.quantity,
        bi.rate,
        bi.line_total,
        bi.dress_name_snapshot,
        bi.is_ready,
        bi.description AS item_description
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      WHERE (bi.dress_id = ? OR (bi.dress_id IS NULL AND LOWER(TRIM(bi.dress_name_snapshot)) = LOWER(TRIM(?))))
        AND bi.deleted_at IS NULL
        AND b.deleted_at IS NULL
    `;
    const params = [dress.id, dress.name];

    if (size && size.trim() && size.trim() !== 'all') {
      query += ` AND LOWER(TRIM(COALESCE(bi.size, ''))) = LOWER(TRIM(?))`;
      params.push(size.trim());
    }

    query += ` ORDER BY b.booking_no DESC`;

    const bookings = db.prepare(query).all(...params);

    const rawSizes = db.prepare(`
      SELECT DISTINCT bi.size FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE (bi.dress_id = ? OR (bi.dress_id IS NULL AND LOWER(TRIM(bi.dress_name_snapshot)) = LOWER(TRIM(?))))
        AND bi.deleted_at IS NULL
        AND b.deleted_at IS NULL
        AND bi.size IS NOT NULL AND TRIM(bi.size) != ''
    `).all(dress.id, dress.name);

    const sizesAvailable = Array.from(new Set([
      ...(dress.size ? [dress.size] : []),
      ...rawSizes.map(r => r.size)
    ].filter(Boolean)));

    return {
      dress,
      sizesAvailable,
      bookings,
    };
  }

  return { list, get, suggestSimilar, nextCode, create, update, setActive, quickAdd, getHistory };
}

module.exports = { createDressesService };
