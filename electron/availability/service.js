/**
 * electron/availability/service.js
 *
 * Phase 6 — Availability and clash warning service.
 *
 * Exposes:
 *  - checkClash(session, { dressId, deliveryDate, returningDate, excludeBookingId })
 *  - getDressAvailability(session, { deliveryDate, returningDate, excludeBookingId })
 *  - getDressBookedRanges(session, dressId)
 *  - logClashOverride(session, { bookingId, dressId, reason })
 */

const { requireRole, ROLES } = require('../auth/roles');
const { findClashes, getDressAvailability, getDressBookedRanges } = require('../domain/clashDetector');

// Buffer days from Phase 0 decisions — 0 means no grace period between bookings
const DEFAULT_BUFFER_DAYS = 0;

function createAvailabilityService(db) {

  /**
   * Check if a specific dress clashes with an existing booking in the given date range.
   * Returns the list of clashing bookings (empty = available).
   */
  function checkClash(session, { dressId, deliveryDate, returningDate = null, excludeBookingId = null }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    if (!dressId)       throw new Error('Dress ID zaroori hai.');
    if (!deliveryDate)  throw new Error('Delivery date zaroori hai.');

    const clashes = findClashes(db, {
      dressId: parseInt(dressId, 10),
      deliveryDate,
      returningDate: returningDate || null,
      excludeBookingId: excludeBookingId ? parseInt(excludeBookingId, 10) : null,
      bufferDays: DEFAULT_BUFFER_DAYS,
    });

    return {
      available: clashes.length === 0,
      clashes,
    };
  }

  /**
   * Get availability of all active dresses for a date range.
   * Used by the Availability screen.
   */
  function getAvailability(session, { deliveryDate, returningDate = null, excludeBookingId = null }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    if (!deliveryDate) throw new Error('Delivery date zaroori hai.');

    const results = getDressAvailability(db, {
      deliveryDate,
      returningDate: returningDate || null,
      excludeBookingId: excludeBookingId ? parseInt(excludeBookingId, 10) : null,
      bufferDays: DEFAULT_BUFFER_DAYS,
    });

    return results;
  }

  /**
   * Get all booked date ranges for a specific dress (for calendar view).
   */
  function getBookedRanges(session, dressId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
    if (!dressId) throw new Error('Dress ID zaroori hai.');
    return getDressBookedRanges(db, parseInt(dressId, 10));
  }

  /**
   * Log that a user chose to override a clash warning.
   * Audited with reason.
   */
  function logClashOverride(session, { bookingId, dressId, dressName, clashBookingNo, reason }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const user = session.user;

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
      VALUES (?, 'clash.override', 'booking_items', ?, ?)
    `).run(
      user.id,
      bookingId || null,
      JSON.stringify({
        dress_id: dressId,
        dress_name: dressName,
        clashing_booking_no: clashBookingNo,
        override_reason: reason || 'User confirmed override',
        overridden_by: user.username,
      }),
    );

    return { ok: true };
  }

  return {
    checkClash,
    getAvailability,
    getBookedRanges,
    logClashOverride,
  };
}

module.exports = { createAvailabilityService };
