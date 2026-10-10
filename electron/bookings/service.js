/**
 * electron/bookings/service.js
 *
 * Booking CRUD + business rules for Ifrah Collection POS.
 *
 * Business rules (plans/claude.md §5):
 *  1. booking_no = next after highest existing (or 412 if table is empty).
 *  2. detail_no  = booking_no * 100 + line_no. Max 99 lines.
 *  3. Delivery date must exist before a dress can be added.
 *  4. line_total = qty * rate.
 *  5. grand_total = sum(line_totals) - discount.
 *  6. remaining  = grand_total - sum(valid rental payments).
 *  7. month      = YYYY-MM derived from booking_date.
 *  8. total_returning_days = |returning_date - delivery_date| in days.
 *  9. Save = one transaction: booking + items + audit.
 * 10. Soft delete only. Delete sets deleted_at on booking + its items + payments.
 * 11. All writes audited via withAudit.
 */

const { withAudit }     = require('../auth/audit');
const { requireRole, ROLES } = require('../auth/roles');

const MAX_LINES = 99;

function createBookingsService(db) {

  // ─── Next booking number ──────────────────────────────────────────────────
  function nextBookingNo() {
    const row = db.prepare(
      `SELECT MAX(booking_no) AS m FROM bookings WHERE deleted_at IS NULL`
    ).get();
    return (row?.m ?? 411) + 1;   // 411 = last Access import; first new = 412
  }

  // ─── LIST ─────────────────────────────────────────────────────────────────
  function list(session, {
    search = '', status = '', cityId = null,
    dateFrom = null, dateTo = null, limit = 200, offset = 0,
  } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        CAST(b.booking_no AS TEXT) LIKE ?
        OR cu.name LIKE ? OR cu.phone LIKE ? OR cu.cnic LIKE ?
        OR b.relative_name LIKE ?
      )`);
      params.push(q, q, q, q, q);
    }

    if (status) { conditions.push('b.status = ?'); params.push(status); }
    if (cityId) { conditions.push('b.city_id = ?'); params.push(cityId); }
    if (dateFrom) { conditions.push('b.delivery_date >= ?'); params.push(dateFrom); }
    if (dateTo)   { conditions.push('b.delivery_date <= ?'); params.push(dateTo); }

    const where = conditions.join(' AND ');

    return db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.booking_date, b.delivery_date, b.returning_date,
        b.booking_month, b.total_returning_days,
        b.grand_total, b.amount_paid, b.remaining,
        b.discount, b.security_deposit, b.notes,
        cu.id   AS customer_id, cu.name AS customer_name,
        cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary,
        b.created_at, b.updated_at,
        ub.full_name AS updated_by_name
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      LEFT JOIN users     ub ON ub.id = b.updated_by
      WHERE ${where}
      ORDER BY b.booking_no DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }

  // ─── GET ONE (full, with items) ───────────────────────────────────────────
  function get(session, id) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const booking = db.prepare(`
      SELECT b.*,
        cu.name AS customer_name, cu.phone AS customer_phone,
        cu.phone2 AS customer_phone2, cu.cnic AS customer_cnic,
        cu.address AS customer_address, cu.relative_name, cu.relative_phone,
        cu.relative_cnic, rt.name AS customer_relation_type,
        ci.name AS city, ca.name AS cast,
        ub.full_name AS updated_by_name,
        cb.full_name AS created_by_name
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      LEFT JOIN casts     ca ON ca.id = (SELECT cast_id FROM customers WHERE id = b.customer_id)
      LEFT JOIN relation_types rt ON rt.id = (SELECT relation_type_id FROM customers WHERE id = b.customer_id)
      LEFT JOIN users ub ON ub.id = b.updated_by
      LEFT JOIN users cb ON cb.id = b.created_by
      WHERE b.id = ? AND b.deleted_at IS NULL
    `).get(id);

    if (!booking) return null;

    const items = db.prepare(`
      SELECT bi.*, d.name AS dress_name_current, dc.name AS category
      FROM booking_items bi
      LEFT JOIN dresses          d  ON d.id  = bi.dress_id
      LEFT JOIN dress_categories dc ON dc.id = (SELECT category_id FROM dresses WHERE id = bi.dress_id)
      WHERE bi.booking_id = ? AND bi.deleted_at IS NULL
      ORDER BY bi.line_no
    `).all(id);

    const payments = db.prepare(`
      SELECT p.*, u.full_name AS received_by_name
      FROM payments p
      LEFT JOIN users u ON u.id = p.received_by
      WHERE p.booking_id = ? AND p.is_void = 0
      ORDER BY p.paid_on, p.id
    `).all(id);

    return { ...booking, items, payments };
  }

  // ─── GET BY booking_no ────────────────────────────────────────────────────
  function getByNo(session, bookingNo) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
    const row = db.prepare(
      `SELECT id FROM bookings WHERE booking_no = ? AND deleted_at IS NULL`
    ).get(bookingNo);
    return row ? get(session, row.id) : null;
  }

  // ─── COMPUTED FIELDS ─────────────────────────────────────────────────────
  function computeMonth(bookingDate) {
    if (!bookingDate) return null;
    return String(bookingDate).slice(0, 7);   // YYYY-MM
  }

  function computeReturningDays(deliveryDate, returningDate) {
    if (!deliveryDate || !returningDate) return null;
    const d1 = new Date(deliveryDate);
    const d2 = new Date(returningDate);
    return Math.abs(Math.round((d2 - d1) / 86400000));
  }

  function computeLineTotals(items) {
    return (items || []).reduce((sum, it) => {
      // Accept both raw input (quantity) and built items (qty)
      const qty  = parseInt(it.qty ?? it.quantity ?? 1, 10);
      const rate = parseInt(it.rate || 0, 10);
      return sum + (qty * rate);
    }, 0);
  }

  function computeGrandTotal(items, discount = 0) {
    const linesTotal = computeLineTotals(items);
    return Math.max(0, linesTotal - parseInt(discount || 0, 10));
  }

  // ─── VALIDATE DETAIL_NO ───────────────────────────────────────────────────
  function buildItems(bookingNo, rawItems) {
    if (rawItems.length > MAX_LINES) {
      throw new Error(`Maximum ${MAX_LINES} dresses per booking.`);
    }
    return rawItems.map((it, idx) => {
      const lineNo    = idx + 1;
      const detailNo  = bookingNo * 100 + lineNo;
      const qty       = Math.max(1, parseInt(it.quantity || 1, 10));
      const rate      = Math.max(0, parseInt(it.rate || 0, 10));
      const lineTotal = qty * rate;

      return {
        lineNo, detailNo, qty, rate, lineTotal,
        dressId:          it.dress_id || null,
        dressNameSnapshot: String(it.dress_name_snapshot || it.dress_name || '').trim() || 'Unknown',
        size:             String(it.size || '').trim() || null,
        description:      String(it.description || '').trim() || null,
        jewellery:        it.jewellery ? 1 : 0,
        clutch_purse:     it.clutch_purse ? 1 : 0,
        hand_bag:         it.hand_bag ? 1 : 0,
        double_dupatta:   it.double_dupatta ? 1 : 0,
        shoes:            it.shoes ? 1 : 0,
      };
    });
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────
  function create(session, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    if (!input.customer_id) {
      throw new Error('Customer select karna zaroori hai. Pehle customer search karein ya naya customer banayein.');
    }

    const bookingNo    = nextBookingNo();
    const rawItems     = input.items || [];
    const builtItems   = buildItems(bookingNo, rawItems);
    const discount     = Math.max(0, parseInt(input.discount || 0, 10));
    // Use raw items for total (they have quantity/rate)
    const grandTotal   = computeGrandTotal(rawItems, discount);
    const bookingMonth = computeMonth(input.booking_date);
    const totalDays    = computeReturningDays(input.delivery_date, input.returning_date);

    const insertBooking = db.prepare(`
      INSERT INTO bookings (
        booking_no, customer_id, city_id, status,
        booking_date, delivery_date, returning_date,
        booking_month, total_returning_days,
        relative_name, relative_relation, notes,
        discount, grand_total, amount_paid, remaining,
        security_deposit, created_by, updated_by
      ) VALUES (
        ?,?,?,?,  ?,?,?,  ?,?,  ?,?,?,  ?,?,0,?,  ?,?,?
      )
    `);

    const insertItem = db.prepare(`
      INSERT INTO booking_items (
        booking_id, line_no, detail_no, dress_id, dress_name_snapshot,
        size, quantity, rate, line_total, description,
        jewellery, clutch_purse, hand_bag, double_dupatta, shoes
      ) VALUES (?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,?)
    `);

    let bookingId;
    const result = db.transaction(() => {
      const r = insertBooking.run(
        bookingNo,
        num(input.customer_id),
        num(input.city_id),
        input.status || 'None',
        str(input.booking_date),
        str(input.delivery_date),
        str(input.returning_date),
        bookingMonth,
        totalDays,
        str(input.relative_name),
        str(input.relative_relation),
        str(input.notes),
        discount,
        grandTotal,
        grandTotal,   // remaining = grandTotal before any payment
        Math.max(0, parseInt(input.security_deposit || 0, 10)),
        user.id,
        user.id,
      );
      bookingId = r.lastInsertRowid;

      for (const it of builtItems) {
        insertItem.run(
          bookingId, it.lineNo, it.detailNo, it.dressId, it.dressNameSnapshot,
          it.size, it.qty, it.rate, it.lineTotal, it.description,
          it.jewellery, it.clutch_purse, it.hand_bag, it.double_dupatta, it.shoes,
        );
      }

      db.prepare(`
        INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        user.id, 'booking.create', 'bookings', bookingId,
        JSON.stringify({ booking_no: bookingNo, grand_total: grandTotal, items: builtItems.length }),
      );

      return r;
    })();

    return { id: result.lastInsertRowid, booking_no: bookingNo };
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  function update(session, id, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    const existing = db.prepare(
      `SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL`
    ).get(id);
    if (!existing) throw new Error('Booking not found.');

    const bookingNo    = existing.booking_no;
    const rawItems     = input.items || [];
    const builtItems   = buildItems(bookingNo, rawItems);
    const discount     = Math.max(0, parseInt(input.discount || 0, 10));
    const grandTotal   = computeGrandTotal(rawItems, discount);
    const amountPaid   = existing.amount_paid || 0;
    const remaining    = Math.max(0, grandTotal - amountPaid);
    const bookingMonth = computeMonth(input.booking_date);
    const totalDays    = computeReturningDays(input.delivery_date, input.returning_date);

    const updateBooking = db.prepare(`
      UPDATE bookings SET
        customer_id = ?, city_id = ?, status = ?,
        booking_date = ?, delivery_date = ?, returning_date = ?,
        booking_month = ?, total_returning_days = ?,
        relative_name = ?, relative_relation = ?, notes = ?,
        discount = ?, grand_total = ?, remaining = ?,
        security_deposit = ?, updated_by = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND deleted_at IS NULL
    `);

    const deleteItems = db.prepare(
      `UPDATE booking_items SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE booking_id = ? AND deleted_at IS NULL`
    );

    const insertItem = db.prepare(`
      INSERT INTO booking_items (
        booking_id, line_no, detail_no, dress_id, dress_name_snapshot,
        size, quantity, rate, line_total, description,
        jewellery, clutch_purse, hand_bag, double_dupatta, shoes
      ) VALUES (?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,?)
    `);

    db.transaction(() => {
      updateBooking.run(
        num(input.customer_id), num(input.city_id),
        input.status || existing.status,
        str(input.booking_date), str(input.delivery_date), str(input.returning_date),
        bookingMonth, totalDays,
        str(input.relative_name), str(input.relative_relation), str(input.notes),
        discount, grandTotal, remaining,
        Math.max(0, parseInt(input.security_deposit || 0, 10)),
        user.id, id,
      );
      deleteItems.run(id);
      for (const it of builtItems) {
        insertItem.run(
          id, it.lineNo, it.detailNo, it.dressId, it.dressNameSnapshot,
          it.size, it.qty, it.rate, it.lineTotal, it.description,
          it.jewellery, it.clutch_purse, it.hand_bag, it.double_dupatta, it.shoes,
        );
      }
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user.id, 'booking.update', 'bookings', id,
        JSON.stringify({ grand_total: existing.grand_total, status: existing.status }),
        JSON.stringify({ grand_total: grandTotal, status: input.status, items: builtItems.length }),
      );
    })();

    return { ok: true };
  }

  // ─── SOFT DELETE (Owner only) ─────────────────────────────────────────────
  function softDelete(session, id) {
    requireRole(session, [ROLES.OWNER]);
    const user = session.user;

    const existing = db.prepare(
      `SELECT booking_no FROM bookings WHERE id = ? AND deleted_at IS NULL`
    ).get(id);
    if (!existing) throw new Error('Booking not found.');

    const doDelete = db.transaction(() => {
      const now = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
      db.prepare(`UPDATE bookings      SET deleted_at = ${now} WHERE id = ?`).run(id);
      db.prepare(`UPDATE booking_items SET deleted_at = ${now} WHERE booking_id = ?`).run(id);
      db.prepare(`UPDATE payments      SET is_void = 1, void_reason = 'booking deleted' WHERE booking_id = ?`).run(id);
    });

    withAudit(db, user, 'booking.delete', 'bookings', id,
      { oldValues: { booking_no: existing.booking_no } },
      doDelete,
    );
    return { ok: true };
  }

  // ─── RECALCULATE TOTALS (called after payment changes) ────────────────────
  function recalcTotals(bookingId) {
    const booking = db.prepare(
      `SELECT grand_total, discount FROM bookings WHERE id = ?`
    ).get(bookingId);
    if (!booking) return;

    const paid = db.prepare(
      `SELECT COALESCE(SUM(amount),0) AS s FROM payments
       WHERE booking_id = ? AND kind = 'rental' AND is_void = 0`
    ).get(bookingId).s;

    const remaining = Math.max(0, booking.grand_total - paid);

    db.prepare(
      `UPDATE bookings SET amount_paid = ?, remaining = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    ).run(paid, remaining, bookingId);
  }

  // ─── TODAY'S SUMMARY (for home screen counters) ───────────────────────────
  function todaySummary() {
    const today = new Date().toISOString().slice(0, 10);
    const deliveries = db.prepare(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE delivery_date = ? AND deleted_at IS NULL AND status != 'Closed'`
    ).get(today).n;

    const returns = db.prepare(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE returning_date = ? AND deleted_at IS NULL AND status != 'Closed'`
    ).get(today).n;

    const overdue = db.prepare(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE returning_date < ? AND delivered_on IS NOT NULL AND returned_on IS NULL
       AND deleted_at IS NULL AND status != 'Closed'`
    ).get(today).n;

    const pending = db.prepare(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE remaining > 0 AND deleted_at IS NULL AND status != 'Closed'`
    ).get().n;

    return { deliveries, returns, overdue, pending };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────
  function str(v) { return v !== undefined && v !== null && v !== '' ? String(v).trim() : null; }
  function num(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }

  return {
    nextBookingNo,
    list, get, getByNo,
    create, update, softDelete,
    recalcTotals,
    todaySummary,
    // expose computation helpers for tests & UI
    computeMonth,
    computeReturningDays,
    computeGrandTotal,
    computeLineTotals,
  };
}

module.exports = { createBookingsService };
