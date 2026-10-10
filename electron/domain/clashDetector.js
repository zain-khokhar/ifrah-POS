/**
 * electron/domain/clashDetector.js
 *
 * Phase 6 — Availability and clash detection.
 *
 * Pure domain function — takes a db instance and parameters, returns results.
 * No side effects. Safe to call from any context (service or test).
 *
 * Business rules:
 *  - Ignore Closed bookings (they are done — dress is free).
 *  - Ignore soft-deleted bookings (deleted_at IS NOT NULL).
 *  - Ignore the booking currently being edited (excludeBookingId).
 *  - A clash exists when date ranges OVERLAP:
 *      existing.delivery_date <= new.returning_date
 *      AND (existing.returning_date IS NULL OR existing.returning_date >= new.delivery_date)
 *  - If returning_date is NULL (open-ended), treat as infinitely far in the future.
 *  - Buffer days: if bufferDays > 0, expand the existing booking's returning_date forward.
 */

/**
 * Check whether a specific dress is already booked in the given date range.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {number}      params.dressId          - ID of dress to check
 * @param {string}      params.deliveryDate      - YYYY-MM-DD
 * @param {string|null} params.returningDate     - YYYY-MM-DD or null (open-ended)
 * @param {number|null} params.excludeBookingId  - booking being edited (skip self)
 * @param {number}      [params.bufferDays=0]    - extra days to add to existing returning_date
 * @returns {Array<{booking_id, booking_no, customer_name, delivery_date, returning_date, status}>}
 */
function findClashes(db, { dressId, deliveryDate, returningDate, excludeBookingId = null, bufferDays = 0 }) {
  if (!dressId || !deliveryDate) return [];

  // Build the overlap condition:
  // Existing booking overlaps new range if:
  //   existing.delivery_date <= new.returningDate (or new is open-ended)
  //   AND (existing.returningDate IS NULL OR existing.returningDate + buffer >= new.deliveryDate)

  const params = [];

  // The new booking's returning date for comparison. If null, treat as far future.
  const newReturn = returningDate || '9999-12-31';

  let sql = `
    SELECT
      b.id          AS booking_id,
      b.booking_no,
      b.status,
      b.delivery_date,
      b.returning_date,
      cu.name       AS customer_name,
      cu.phone      AS customer_phone,
      bi.dress_name_snapshot
    FROM booking_items bi
    JOIN bookings b ON b.id = bi.booking_id
    LEFT JOIN customers cu ON cu.id = b.customer_id
    WHERE bi.dress_id = ?
      AND bi.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND b.status != 'Closed'
      AND b.delivery_date IS NOT NULL
      AND b.delivery_date <= ?
  `;
  params.push(dressId, newReturn);

  // Existing returning_date must be >= new delivery_date (with buffer)
  if (bufferDays > 0) {
    // Add buffer to existing returning_date
    sql += `
      AND (
        b.returning_date IS NULL
        OR date(b.returning_date, '+${Math.floor(bufferDays)} days') >= ?
      )
    `;
  } else {
    sql += `
      AND (
        b.returning_date IS NULL
        OR b.returning_date >= ?
      )
    `;
  }
  params.push(deliveryDate);

  if (excludeBookingId) {
    sql += ` AND b.id != ?`;
    params.push(excludeBookingId);
  }

  sql += ` ORDER BY b.delivery_date`;

  return db.prepare(sql).all(...params);
}

/**
 * Check availability of ALL dresses for a given date range.
 * Used by the Availability screen.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {string}      params.deliveryDate
 * @param {string|null} params.returningDate
 * @param {number|null} params.excludeBookingId
 * @param {number}      [params.bufferDays=0]
 * @returns {Array<{dress_id, dress_code, dress_name, category, size, rental_price, photo_path, status: 'available'|'booked', clashes: Array}>}
 */
function getDressAvailability(db, { deliveryDate, returningDate, excludeBookingId = null, bufferDays = 0 }) {
  if (!deliveryDate) return [];

  // Get all active dresses
  const dresses = db.prepare(`
    SELECT d.id, d.code, d.name, d.size, d.rental_price, d.photo_path,
           dc.name AS category
    FROM dresses d
    LEFT JOIN dress_categories dc ON dc.id = d.category_id
    WHERE d.active = 1 AND d.deleted_at IS NULL
    ORDER BY d.name
  `).all();

  return dresses.map(dress => {
    const clashes = findClashes(db, {
      dressId: dress.id,
      deliveryDate,
      returningDate,
      excludeBookingId,
      bufferDays,
    });

    return {
      dress_id:     dress.id,
      dress_code:   dress.code,
      dress_name:   dress.name,
      category:     dress.category,
      size:         dress.size,
      rental_price: dress.rental_price,
      photo_path:   dress.photo_path,
      status:       clashes.length > 0 ? 'booked' : 'available',
      clashes,
    };
  });
}

/**
 * Get booked date ranges for a specific dress (for the month calendar view).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} dressId
 * @returns {Array<{booking_id, booking_no, customer_name, delivery_date, returning_date, status}>}
 */
function getDressBookedRanges(db, dressId) {
  return db.prepare(`
    SELECT
      b.id     AS booking_id,
      b.booking_no,
      b.status,
      b.delivery_date,
      b.returning_date,
      cu.name  AS customer_name,
      cu.phone AS customer_phone
    FROM booking_items bi
    JOIN bookings b ON b.id = bi.booking_id
    LEFT JOIN customers cu ON cu.id = b.customer_id
    WHERE bi.dress_id = ?
      AND bi.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND b.status != 'Closed'
      AND b.delivery_date IS NOT NULL
    ORDER BY b.delivery_date
  `).all(dressId);
}

module.exports = { findClashes, getDressAvailability, getDressBookedRanges };
