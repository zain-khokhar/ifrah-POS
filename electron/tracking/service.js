/**
 * electron/tracking/service.js
 *
 * Phase 9 — Delivery and Return Tracking Service for Ifrah Collection POS.
 *
 * Capabilities:
 *  - Mark delivered with date and note
 *  - Mark returned with condition (OK, Needs cleaning, Damaged), damage note, optional photo
 *  - Overdue returns calculation with exact days late
 *  - Return prompts: refund security deposit, take remaining payment, close booking
 *  - Per-dress 'ready / prepared' tick for night-before prep
 *  - Live Home counters summary
 *  - Full audit logging on every transition
 */

const { requireRole, ROLES } = require('../auth/roles');
const { withAudit } = require('../auth/audit');

function createTrackingService(db, bookingsService, paymentsService) {

  function getTodayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function getTomorrowIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function getDaysLate(returningDate, today) {
    if (!returningDate || !today) return 0;
    const r = new Date(returningDate + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    const diff = Math.floor((t - r) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  // ─── LIST DELIVERIES ──────────────────────────────────────────────────────
  function listDeliveries(session, { filter = 'today', date = null, search = '' } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const today = getTodayIso();
    const tomorrow = getTomorrowIso();

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    if (filter === 'today') {
      conditions.push('b.delivery_date = ? AND b.delivered_on IS NULL');
      params.push(today);
    } else if (filter === 'tomorrow') {
      conditions.push('b.delivery_date = ? AND b.delivered_on IS NULL');
      params.push(tomorrow);
    } else if (filter === 'next2days') {
      const next2Iso = getNext2DaysIso();
      conditions.push('b.delivery_date >= ? AND b.delivery_date <= ? AND b.delivered_on IS NULL');
      params.push(today, next2Iso);
    } else if (filter === 'upcoming') {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const futureIso = future.toISOString().slice(0, 10);
      conditions.push('b.delivery_date >= ? AND b.delivery_date <= ? AND b.delivered_on IS NULL');
      params.push(today, futureIso);
    } else if (filter === 'pending') {
      conditions.push('b.delivered_on IS NULL');
    } else if (filter === 'delivered') {
      conditions.push('b.delivered_on IS NOT NULL');
    } else if (date) {
      conditions.push('b.delivery_date = ? AND b.delivered_on IS NULL');
      params.push(date);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        CAST(b.booking_no AS TEXT) LIKE ?
        OR cu.name LIKE ? OR cu.phone LIKE ? OR cu.cnic LIKE ?
      )`);
      params.push(q, q, q, q);
    }

    const where = conditions.join(' AND ');

    const bookings = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.booking_date, b.delivery_date, b.returning_date,
        b.delivered_on, b.delivery_note,
        b.returned_on, b.return_condition,
        b.grand_total, b.amount_paid, b.remaining,
        b.security_deposit, b.notes,
        cu.id AS customer_id, cu.name AS customer_name,
        cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary,
        (SELECT COUNT(*) FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS total_items,
        (SELECT COUNT(*) FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL AND is_ready = 1) AS ready_items
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      WHERE ${where}
      ORDER BY b.delivery_date ASC, b.booking_no ASC
    `).all(...params);

    // Fetch individual items with ready state for each booking
    const getItems = db.prepare(`
      SELECT id, line_no, detail_no, dress_name_snapshot, size, quantity, rate, line_total,
             jewellery, clutch_purse, hand_bag, double_dupatta, shoes,
             is_ready, item_condition
      FROM booking_items
      WHERE booking_id = ? AND deleted_at IS NULL
      ORDER BY line_no ASC
    `);

    return bookings.map(b => ({
      ...b,
      items: getItems.all(b.id),
      all_ready: b.total_items > 0 && b.ready_items === b.total_items,
    }));
  }

  // ─── LIST RETURNS ─────────────────────────────────────────────────────────
  function listReturns(session, { filter = 'all', search = '' } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const today = getTodayIso();
    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    if (filter === 'overdue') {
      conditions.push('b.delivered_on IS NOT NULL AND b.returned_on IS NULL AND b.returning_date < ?');
      params.push(today);
    } else if (filter === 'due_today') {
      conditions.push('b.returning_date = ? AND b.returned_on IS NULL');
      params.push(today);
    } else if (filter === 'returned') {
      conditions.push('b.returned_on IS NOT NULL');
    } else if (filter === 'pending') {
      conditions.push('b.returned_on IS NULL');
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        CAST(b.booking_no AS TEXT) LIKE ?
        OR cu.name LIKE ? OR cu.phone LIKE ? OR cu.cnic LIKE ?
      )`);
      params.push(q, q, q, q);
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.booking_date, b.delivery_date, b.returning_date,
        b.delivered_on, b.delivery_note,
        b.returned_on, b.return_condition, b.return_damage_note, b.return_damage_photo,
        b.grand_total, b.amount_paid, b.remaining,
        b.security_deposit, b.notes,
        cu.id AS customer_id, cu.name AS customer_name,
        cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary,
        (SELECT COUNT(*) FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS total_items
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      WHERE ${where}
      ORDER BY
        CASE
          WHEN b.delivered_on IS NOT NULL AND b.returned_on IS NULL AND b.returning_date < '${today}' THEN 1
          WHEN b.returning_date = '${today}' AND b.returned_on IS NULL THEN 2
          ELSE 3
        END ASC,
        b.returning_date ASC, b.booking_no ASC
    `).all(...params);

    return rows.map(r => {
      const isOverdue = Boolean(r.delivered_on && !r.returned_on && r.returning_date && r.returning_date < today);
      const daysLate = isOverdue ? getDaysLate(r.returning_date, today) : 0;
      return {
        ...r,
        is_overdue: isOverdue,
        days_late: daysLate,
      };
    });
  }

  // ─── MARK DELIVERED ───────────────────────────────────────────────────────
  function markDelivered(session, { bookingId, deliveredOn = null, deliveryNote = '', allItemsReady = true }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    const dateVal = deliveredOn || getTodayIso();
    const user = session?.user || session;

    const existing = db.prepare('SELECT id, status, delivered_on FROM bookings WHERE id = ? AND deleted_at IS NULL').get(bookingId);
    if (!existing) {
      throw new Error(`Booking #${bookingId} not found.`);
    }

    const prevDelivered = existing.delivered_on;
    const targetStatus = existing.status === 'None' ? 'Open' : existing.status;

    return withAudit(
      db,
      user,
      'DELIVERY_MARKED',
      'bookings',
      bookingId,
      {
        oldValues: { delivered_on: prevDelivered, status: existing.status },
        newValues: { delivered_on: dateVal, delivery_note: deliveryNote, status: targetStatus },
      },
      () => {
        db.prepare(`
          UPDATE bookings
          SET delivered_on = ?,
              delivery_note = ?,
              status = ?,
              updated_by = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(dateVal, deliveryNote || null, targetStatus, user.id, bookingId);

        if (allItemsReady) {
          db.prepare(`
            UPDATE booking_items
            SET is_ready = 1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE booking_id = ? AND deleted_at IS NULL
          `).run(bookingId);
        }

        return {
          ok: true,
          bookingId,
          delivered_on: dateVal,
          status: targetStatus,
        };
      }
    );
  }

  // ─── UNMARK DELIVERED ─────────────────────────────────────────────────────
  function unmarkDelivered(session, bookingId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session?.user || session;

    const existing = db.prepare('SELECT id, delivered_on FROM bookings WHERE id = ? AND deleted_at IS NULL').get(bookingId);
    if (!existing) throw new Error(`Booking #${bookingId} not found.`);

    return withAudit(
      db,
      user,
      'DELIVERY_UNMARKED',
      'bookings',
      bookingId,
      { oldValues: { delivered_on: existing.delivered_on }, newValues: { delivered_on: null } },
      () => {
        db.prepare(`
          UPDATE bookings
          SET delivered_on = NULL,
              delivery_note = NULL,
              updated_by = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(user.id, bookingId);

        return { ok: true, bookingId };
      }
    );
  }

  // ─── MARK RETURNED ────────────────────────────────────────────────────────
  function markReturned(session, {
    bookingId,
    returnedOn = null,
    condition = null,
    returnCondition = null,
    damageNote = '',
    returnDamageNote = '',
    damagePhoto = '',
    refundDeposit = false,
    depositRefundMethod = 'cash',
    depositRefundAmount = null,
    receiveRemaining = false,
    remainingMethod = 'cash',
    remainingAmount = null,
    closeBooking = false,
    closeReason = '',
  }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session?.user || session;
    const dateVal = returnedOn || getTodayIso();
    const finalCondition = condition || returnCondition || 'OK';
    const finalDamageNote = damageNote || returnDamageNote || '';

    const booking = db.prepare(`
      SELECT id, booking_no, status, delivered_on, returned_on,
             return_condition, remaining, security_deposit
      FROM bookings
      WHERE id = ? AND deleted_at IS NULL
    `).get(bookingId);

    if (!booking) {
      throw new Error(`Booking #${bookingId} not found.`);
    }

    const prevReturned = booking.returned_on;

    return withAudit(
      db,
      user,
      'RETURN_MARKED',
      'bookings',
      bookingId,
      {
        oldValues: { returned_on: prevReturned, return_condition: booking.return_condition },
        newValues: { returned_on: dateVal, return_condition: finalCondition, return_damage_note: finalDamageNote },
      },
      () => {
        // If not marked delivered yet, auto-mark delivery date as well
        const autoDeliver = !booking.delivered_on ? dateVal : booking.delivered_on;

        db.prepare(`
          UPDATE bookings
          SET returned_on = ?,
              return_condition = ?,
              return_damage_note = ?,
              return_damage_photo = ?,
              delivered_on = ?,
              updated_by = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(dateVal, finalCondition, finalDamageNote || null, damagePhoto || null, autoDeliver, user.id, bookingId);

        // 0. Update dress condition_status & queue maintenance if dry-clean or repair needed
        const condLower = String(finalCondition || '').toLowerCase().trim();
        let targetConditionStatus = 'good';
        let isMaintenance = false;

        if (condLower.includes('clean') || condLower.includes('dry')) {
          targetConditionStatus = 'need_dry_clean';
          isMaintenance = true;
        } else if (condLower.includes('damage') || condLower.includes('repair') || condLower.includes('kharab')) {
          targetConditionStatus = 'need_repair';
          isMaintenance = true;
        } else {
          targetConditionStatus = 'good';
        }

        const bookingItems = db.prepare(`
          SELECT bi.dress_id, bi.dress_name_snapshot
          FROM booking_items bi
          WHERE bi.booking_id = ? AND bi.deleted_at IS NULL
        `).all(bookingId);

        for (const item of bookingItems) {
          if (item.dress_id) {
            try {
              db.prepare(`
                UPDATE dresses
                SET condition_status = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE id = ? AND deleted_at IS NULL
              `).run(targetConditionStatus, item.dress_id);

              if (isMaintenance) {
                db.prepare(`
                  INSERT INTO dress_maintenance_logs (
                    dress_id, booking_id, status, notes, photo_path, sent_at
                  ) VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                  item.dress_id,
                  bookingId,
                  targetConditionStatus,
                  finalDamageNote || `Returned with status: ${finalCondition}`,
                  damagePhoto || null,
                  dateVal
                );
              }
            } catch (dErr) {
              console.warn('[Tracking] Failed to sync dress condition:', dErr.message);
            }
          }
        }

        // 1. Refund security deposit prompt automation
        if (refundDeposit && booking.security_deposit > 0) {
          const refAmt = Number(depositRefundAmount || booking.security_deposit);
          if (refAmt > 0) {
            paymentsService.create(session, {
              booking_id: bookingId,
              amount: refAmt,
              payment_method: depositRefundMethod || 'cash',
              kind: 'deposit_refund',
              note: `Security deposit refund on return (${condition})`,
              paid_on: dateVal,
            });
          }
        }

        // 2. Receive remaining payment prompt automation
        if (receiveRemaining && booking.remaining > 0) {
          const payAmt = Number(remainingAmount || booking.remaining);
          if (payAmt > 0) {
            paymentsService.create(session, {
              booking_id: bookingId,
              amount: payAmt,
              payment_method: remainingMethod || 'cash',
              kind: 'rental',
              note: 'Remaining balance received upon dress return',
              paid_on: dateVal,
            });
          }
        }

        // Recalculate remaining
        const updatedBooking = db.prepare('SELECT remaining, status FROM bookings WHERE id = ?').get(bookingId);

        // 3. Offer to close booking if requested and eligible
        let finalStatus = updatedBooking.status;
        if (closeBooking) {
          const check = bookingsService.canClose(bookingId);
          if (check.canClose) {
            bookingsService.setStatus(session, bookingId, 'Closed', { force: false });
            finalStatus = 'Closed';
          } else if (user.role === ROLES.OWNER && closeReason) {
            bookingsService.setStatus(session, bookingId, 'Closed', { force: true, reason: closeReason });
            finalStatus = 'Closed';
          }
        }

        return {
          ok: true,
          bookingId,
          returned_on: dateVal,
          return_condition: condition,
          status: finalStatus,
          remaining: updatedBooking.remaining,
        };
      }
    );
  }

  // ─── UNMARK RETURNED ──────────────────────────────────────────────────────
  function unmarkReturned(session, bookingId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session?.user || session;

    const existing = db.prepare('SELECT id, returned_on FROM bookings WHERE id = ? AND deleted_at IS NULL').get(bookingId);
    if (!existing) throw new Error(`Booking #${bookingId} not found.`);

    return withAudit(
      db,
      user,
      'RETURN_UNMARKED',
      'bookings',
      bookingId,
      { oldValues: { returned_on: existing.returned_on }, newValues: { returned_on: null } },
      () => {
        db.prepare(`
          UPDATE bookings
          SET returned_on = NULL,
              return_condition = NULL,
              return_damage_note = NULL,
              return_damage_photo = NULL,
              updated_by = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(user.id, bookingId);

        return { ok: true, bookingId };
      }
    );
  }

  // ─── TOGGLE ITEM READY (Per-line prep tick) ───────────────────────────────
  function toggleItemReady(session, { itemId, isReady }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session?.user || session;
    const readyVal = isReady ? 1 : 0;

    const item = db.prepare('SELECT id, booking_id, is_ready FROM booking_items WHERE id = ? AND deleted_at IS NULL').get(itemId);
    if (!item) throw new Error(`Item #${itemId} not found.`);

    return withAudit(
      db,
      user,
      'ITEM_READY_TOGGLED',
      'booking_items',
      itemId,
      { oldValues: { is_ready: item.is_ready }, newValues: { is_ready: readyVal } },
      () => {
        db.prepare(`
          UPDATE booking_items
          SET is_ready = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(readyVal, itemId);

        return { ok: true, itemId, is_ready: readyVal };
      }
    );
  }

  // ─── HOME COUNTERS SUMMARY ────────────────────────────────────────────────
  function getTrackingSummary(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const today = getTodayIso();

    const deliveries = db.prepare(`
      SELECT COUNT(*) AS n FROM bookings
      WHERE delivery_date = ? AND delivered_on IS NULL
        AND deleted_at IS NULL AND status != 'Closed'
    `).get(today).n;

    const returns = db.prepare(`
      SELECT COUNT(*) AS n FROM bookings
      WHERE returning_date = ? AND returned_on IS NULL
        AND deleted_at IS NULL AND status != 'Closed'
    `).get(today).n;

    const overdue = db.prepare(`
      SELECT COUNT(*) AS n FROM bookings
      WHERE delivered_on IS NOT NULL AND returned_on IS NULL
        AND returning_date < ? AND deleted_at IS NULL AND status != 'Closed'
    `).get(today).n;

    const pending = db.prepare(`
      SELECT COUNT(*) AS n FROM bookings
      WHERE remaining > 0 AND deleted_at IS NULL AND status != 'Closed'
    `).get().n;

    return {
      deliveries,
      returns,
      overdue,
      pending,
      today,
    };
  }

  return {
    listDeliveries,
    listReturns,
    markDelivered,
    unmarkDelivered,
    markReturned,
    unmarkReturned,
    toggleItemReady,
    getTrackingSummary,
  };
}

module.exports = { createTrackingService };
