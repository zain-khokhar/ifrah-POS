/**
 * electron/payments/service.js
 *
 * Payment service for Ifrah Collection POS (Phase 5).
 *
 * Rules:
 *  1. Payments are append-only.
 *  2. To fix a mistake: void with reason (Owner only) and add a new row.
 *  3. Payment methods: 'cash', 'bank', 'wallet', 'other'.
 *  4. Kinds: 'rental' (affects remaining), 'deposit' (security deposit, does NOT affect remaining),
 *            'deposit_refund' (refund of security deposit).
 *  5. Remaining = grand_total - sum(valid rental payments). Always computed, never trusted from client.
 *  6. All writes audited via withAudit.
 */

const { withAudit } = require('../auth/audit');
const { requireRole, ROLES } = require('../auth/roles');

const VALID_METHODS = ['cash', 'bank', 'wallet', 'other'];
const VALID_KINDS   = ['rental', 'deposit', 'deposit_refund'];

function createPaymentsService(db) {

  // ─── Recalculate Booking Totals ───────────────────────────────────────────
  function recalcBookingTotals(bookingId) {
    const booking = db.prepare(`
      SELECT id, grand_total, security_deposit FROM bookings WHERE id = ?
    `).get(bookingId);
    if (!booking) return null;

    // Sum of valid (non-void) rental payments
    const rentalPaidRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE booking_id = ? AND kind = 'rental' AND is_void = 0
    `).get(bookingId);
    const rentalPaid = rentalPaidRow ? rentalPaidRow.total : 0;

    const remaining = Math.max(0, booking.grand_total - rentalPaid);

    db.prepare(`
      UPDATE bookings
      SET amount_paid = ?, remaining = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(rentalPaid, remaining, bookingId);

    return { amount_paid: rentalPaid, remaining };
  }

  // ─── CREATE PAYMENT ───────────────────────────────────────────────────────
  function create(session, input) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    const bookingId = parseInt(input.booking_id, 10);
    if (!bookingId || isNaN(bookingId)) {
      throw new Error('Valid booking ID zaroori hai.');
    }

    const booking = db.prepare(`
      SELECT id, booking_no, grand_total, amount_paid, remaining
      FROM bookings
      WHERE id = ? AND deleted_at IS NULL
    `).get(bookingId);
    if (!booking) throw new Error('Booking nahi mili.');

    const amount = parseInt(input.amount, 10);
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount 0 se zyada hona zaroori hai.');
    }

    const method = String(input.payment_method || 'cash').toLowerCase();
    if (!VALID_METHODS.includes(method)) {
      throw new Error(`Invalid payment method: ${method}. (cash, bank, wallet, other)`);
    }

    const kind = String(input.kind || 'rental').toLowerCase();
    if (!VALID_KINDS.includes(kind)) {
      throw new Error(`Invalid payment kind: ${kind}. (rental, deposit, deposit_refund)`);
    }

    const paidOn = input.paid_on ? String(input.paid_on).trim() : new Date().toISOString().slice(0, 10);
    const note   = input.note ? String(input.note).trim() : null;

    let newPaymentId;
    let newTotals;

    const doCreate = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO payments (
          booking_id, amount, payment_method, kind,
          received_by, note, paid_on, is_void
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(bookingId, amount, method, kind, user.id, note, paidOn);

      newPaymentId = result.lastInsertRowid;
      newTotals = recalcBookingTotals(bookingId);
    });

    withAudit(db, user, 'payment.create', 'payments', null,
      {
        newValues: {
          id: newPaymentId,
          booking_id: bookingId,
          booking_no: booking.booking_no,
          amount,
          payment_method: method,
          kind,
          paid_on: paidOn,
        },
      },
      doCreate
    );

    return {
      id: newPaymentId,
      booking_id: bookingId,
      amount,
      payment_method: method,
      kind,
      paid_on: paidOn,
      totals: newTotals,
    };
  }

  // ─── VOID PAYMENT (Owner only) ────────────────────────────────────────────
  function voidPayment(session, paymentId, { reason } = {}) {
    requireRole(session, [ROLES.OWNER]);
    const user = session.user;

    const pId = parseInt(paymentId, 10);
    if (!pId || isNaN(pId)) throw new Error('Payment ID invalid hai.');

    const existing = db.prepare(`
      SELECT p.*, b.booking_no
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE p.id = ?
    `).get(pId);

    if (!existing) throw new Error('Payment record nahi mila.');
    if (existing.is_void === 1) throw new Error('Ye payment pehle se void ho chuki hai.');

    const voidReason = reason ? String(reason).trim() : 'Voided by owner';
    let newTotals;

    const doVoid = db.transaction(() => {
      db.prepare(`
        UPDATE payments
        SET is_void = 1,
            void_reason = ?,
            voided_by = ?,
            voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(voidReason, user.id, pId);

      newTotals = recalcBookingTotals(existing.booking_id);
    });

    withAudit(db, user, 'payment.void', 'payments', pId,
      {
        oldValues: { amount: existing.amount, kind: existing.kind, is_void: 0 },
        newValues: { is_void: 1, void_reason: voidReason, voided_by: user.id },
      },
      doVoid
    );

    return { ok: true, id: pId, totals: newTotals };
  }

  // ─── LIST BY BOOKING ──────────────────────────────────────────────────────
  function listByBooking(session, bookingId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const bId = parseInt(bookingId, 10);
    if (!bId || isNaN(bId)) return [];

    return db.prepare(`
      SELECT
        p.id, p.sync_id, p.booking_id, p.amount, p.payment_method, p.kind,
        p.note, p.paid_on, p.is_void, p.void_reason, p.voided_at,
        p.created_at,
        u_recv.full_name AS received_by_name,
        u_void.full_name AS voided_by_name
      FROM payments p
      LEFT JOIN users u_recv ON u_recv.id = p.received_by
      LEFT JOIN users u_void ON u_void.id = p.voided_by
      WHERE p.booking_id = ?
      ORDER BY p.id ASC
    `).all(bId);
  }

  // ─── LIST ALL (for Payments view) ─────────────────────────────────────────
  function listAll(session, {
    search = '', method = '', kind = '',
    dateFrom = null, dateTo = null,
    limit = 200, offset = 0,
  } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        CAST(b.booking_no AS TEXT) LIKE ?
        OR cu.name LIKE ?
        OR cu.phone LIKE ?
        OR p.note LIKE ?
      )`);
      params.push(q, q, q, q);
    }

    if (method) {
      conditions.push('p.payment_method = ?');
      params.push(method.toLowerCase());
    }

    if (kind) {
      conditions.push('p.kind = ?');
      params.push(kind.toLowerCase());
    }

    if (dateFrom) {
      conditions.push('p.paid_on >= ?');
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push('p.paid_on <= ?');
      params.push(dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return db.prepare(`
      SELECT
        p.id, p.booking_id, p.amount, p.payment_method, p.kind,
        p.note, p.paid_on, p.is_void, p.void_reason, p.created_at,
        b.booking_no, b.status AS booking_status,
        cu.id AS customer_id, cu.name AS customer_name, cu.phone AS customer_phone,
        u_recv.full_name AS received_by_name
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN users u_recv ON u_recv.id = p.received_by
      ${where}
      ORDER BY p.paid_on DESC, p.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }

  // ─── GET SUMMARY STATS ────────────────────────────────────────────────────
  function getSummary(session, { dateFrom = null, dateTo = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['is_void = 0', "kind = 'rental'"];
    const params = [];

    if (dateFrom) { conditions.push('paid_on >= ?'); params.push(dateFrom); }
    if (dateTo)   { conditions.push('paid_on <= ?'); params.push(dateTo); }

    const where = conditions.join(' AND ');

    const total = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE ${where}`).get(...params)?.s || 0;
    const cash  = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE ${where} AND payment_method = 'cash'`).get(...params)?.s || 0;
    const bank  = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE ${where} AND payment_method = 'bank'`).get(...params)?.s || 0;
    const wallet = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE ${where} AND payment_method = 'wallet'`).get(...params)?.s || 0;

    const depositConditions = ['is_void = 0', "kind = 'deposit'"];
    const depParams = [];
    if (dateFrom) { depositConditions.push('paid_on >= ?'); depParams.push(dateFrom); }
    if (dateTo)   { depositConditions.push('paid_on <= ?'); depParams.push(dateTo); }
    const depositTotal = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE ${depositConditions.join(' AND ')}`).get(...depParams)?.s || 0;

    return {
      total,
      cash,
      bank,
      wallet,
      depositTotal,
    };
  }

  return {
    create,
    voidPayment,
    listByBooking,
    listAll,
    getSummary,
    recalcBookingTotals,
  };
}

module.exports = {
  createPaymentsService,
  VALID_METHODS,
  VALID_KINDS,
};
