/**
 * electron/customers/service.js
 *
 * Customer CRUD for Ifrah Collection POS.
 *
 * Plan rules (§3 Phase 3):
 *  - No mandatory fields except what a business rule truly needs.
 *  - Phone stored as text (leading zeros preserved).
 *  - CNIC format validated only when something is typed.
 *  - Duplicate guard: same name + phone → warn, don't create a copy.
 *  - Soft delete only (deleted_at). No hard delete.
 *  - Every write is audited.
 *  - Parameterised queries only — never string-concatenated SQL.
 */

const { withAudit }     = require('../auth/audit');
const { requireRole, ROLES } = require('../auth/roles');
const { normalizeName } = require('../domain/normalize');

// CNIC format: 00000-0000000-0  (13 digits)
const CNIC_RE = /^\d{5}-\d{7}-\d$/;

function createCustomersService(db) {

  // ─── LIST ────────────────────────────────────────────────────────────────
  /**
   * All active customers + city name + cast name + booking count.
   * Supports optional search text (name, phone, CNIC, city, cast).
   */
  function list(session, { search = '', cityId = null, castId = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['c.deleted_at IS NULL'];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        c.name LIKE ? OR c.phone LIKE ? OR c.phone2 LIKE ?
        OR c.cnic LIKE ? OR c.relative_name LIKE ?
        OR ci.name LIKE ? OR ca.name LIKE ?
      )`);
      params.push(q, q, q, q, q, q, q);
    }

    if (cityId) { conditions.push('c.city_id = ?'); params.push(cityId); }
    if (castId) { conditions.push('c.cast_id = ?'); params.push(castId); }

    const where = conditions.join(' AND ');

    return db.prepare(`
      SELECT
        c.id, c.name, c.phone, c.phone2, c.cnic,
        c.relative_name, c.relative_phone, c.relative_cnic,
        rt.name  AS relation_type,
        c.relation_type_id,
        ci.name  AS city,  c.city_id,
        ca.name  AS cast,  c.cast_id,
        c.address, c.notes, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.customer_id = c.id AND b.deleted_at IS NULL) AS booking_count
      FROM customers c
      LEFT JOIN cities          ci ON ci.id = c.city_id
      LEFT JOIN casts           ca ON ca.id = c.cast_id
      LEFT JOIN relation_types  rt ON rt.id = c.relation_type_id
      WHERE ${where}
      ORDER BY c.name COLLATE NOCASE
    `).all(...params);
  }

  // ─── GET ONE ─────────────────────────────────────────────────────────────
  function get(session, id) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
    return db.prepare(`
      SELECT
        c.*,
        rt.name  AS relation_type,
        ci.name  AS city,
        ca.name  AS cast,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.customer_id = c.id AND b.deleted_at IS NULL) AS booking_count
      FROM customers c
      LEFT JOIN cities          ci ON ci.id = c.city_id
      LEFT JOIN casts           ca ON ca.id = c.cast_id
      LEFT JOIN relation_types  rt ON rt.id = c.relation_type_id
      WHERE c.id = ? AND c.deleted_at IS NULL
    `).get(id) || null;
  }

  // ─── CHECK DUPLICATE ─────────────────────────────────────────────────────
  /**
   * Returns an existing customer with the same name (normalised) AND phone.
   * Used to show "This customer already exists. Use them?" prompt.
   */
  function findDuplicate(name, phone, excludeId = null) {
    if (!name) return null;
    const normalizedName = normalizeName(name);

    let row;
    if (phone && phone.trim()) {
      // Match on name AND phone (phone as text, strip non-digits for comparison)
      const phoneDigits = phone.replace(/\D/g, '');
      row = db.prepare(`
        SELECT id, name, phone
        FROM customers
        WHERE lower(replace(replace(replace(replace(name,' ',''),'-',''),'.',''),',','')) = ?
          AND replace(replace(phone,'-',''),' ','') = ?
          AND deleted_at IS NULL
          ${excludeId ? 'AND id != ?' : ''}
      `).get(normalizedName, phoneDigits, ...(excludeId ? [excludeId] : []));
    } else {
      row = db.prepare(`
        SELECT id, name, phone
        FROM customers
        WHERE lower(replace(replace(replace(replace(name,' ',''),'-',''),'.',''),',','')) = ?
          AND deleted_at IS NULL
          ${excludeId ? 'AND id != ?' : ''}
      `).get(normalizedName, ...(excludeId ? [excludeId] : []));
    }
    return row || null;
  }

  // ─── CREATE ──────────────────────────────────────────────────────────────
  function create(session, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    validateCnic(input.cnic);
    validateCnic(input.relative_cnic, 'Relative CNIC');

    const result = withAudit(db, user, 'customer.create', 'customers',
      r => r.lastInsertRowid,
      { newValues: sanitize(input) },
      () => db.prepare(`
        INSERT INTO customers
          (name, phone, phone2, cnic,
           relation_type_id, relative_name, relative_phone, relative_cnic,
           city_id, cast_id, address, notes, created_by, updated_by)
        VALUES (?,?,?,?,  ?,?,?,?,  ?,?,?,?,?,?)
      `).run(
        str(input.name),
        str(input.phone),
        str(input.phone2),
        str(input.cnic),
        num(input.relation_type_id),
        str(input.relative_name),
        str(input.relative_phone),
        str(input.relative_cnic),
        num(input.city_id),
        num(input.cast_id),
        str(input.address),
        str(input.notes),
        user.id,
        user.id,
      )
    );
    return { id: result.lastInsertRowid };
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────
  function update(session, id, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    validateCnic(input.cnic);
    validateCnic(input.relative_cnic, 'Relative CNIC');

    const old = get(session, id);
    if (!old) throw new Error('Customer not found.');

    withAudit(db, user, 'customer.update', 'customers', id,
      { oldValues: sanitize(old), newValues: sanitize(input) },
      () => db.prepare(`
        UPDATE customers SET
          name = ?, phone = ?, phone2 = ?, cnic = ?,
          relation_type_id = ?, relative_name = ?, relative_phone = ?, relative_cnic = ?,
          city_id = ?, cast_id = ?, address = ?, notes = ?,
          updated_by = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        str(input.name),
        str(input.phone),
        str(input.phone2),
        str(input.cnic),
        num(input.relation_type_id),
        str(input.relative_name),
        str(input.relative_phone),
        str(input.relative_cnic),
        num(input.city_id),
        num(input.cast_id),
        str(input.address),
        str(input.notes),
        user.id,
        id,
      )
    );
    return { ok: true };
  }

  // ─── DELETE (soft, Owner only) ───────────────────────────────────────────
  function softDelete(session, id) {
    const user = requireRole(session, [ROLES.OWNER]);
    const old = get(session, id);
    if (!old) throw new Error('Customer not found.');

    // Block delete if there are active bookings
    const activeBookings = db.prepare(
      `SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND deleted_at IS NULL`
    ).get(id);
    if (activeBookings.n > 0) {
      throw new Error(`This customer has ${activeBookings.n} booking(s). Close or delete them first.`);
    }

    withAudit(db, user, 'customer.delete', 'customers', id,
      { oldValues: { name: old.name } },
      () => db.prepare(
        `UPDATE customers SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND deleted_at IS NULL`
      ).run(id)
    );
    return { ok: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function str(v) { return v !== undefined && v !== null && v !== '' ? String(v).trim() : null; }
  function num(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }

  function sanitize(obj) {
    return {
      name: obj.name, phone: obj.phone, phone2: obj.phone2, cnic: obj.cnic,
      relative_name: obj.relative_name, relative_phone: obj.relative_phone,
      relative_cnic: obj.relative_cnic, city_id: obj.city_id, cast_id: obj.cast_id,
      address: obj.address, notes: obj.notes,
    };
  }

  function validateCnic(cnic, label = 'CNIC') {
    if (cnic && cnic.trim() && !CNIC_RE.test(cnic.trim())) {
      throw new Error(`${label} format chahiye: 00000-0000000-0`);
    }
  }

  return { list, get, findDuplicate, create, update, softDelete };
}

module.exports = { createCustomersService };
