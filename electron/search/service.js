/**
 * electron/search/service.js
 *
 * Phase 7 — Global search and advanced filters.
 *
 * Search covers: booking_no, customer name, relative name,
 * phone (both), CNIC (with/without dashes), city, cast, dress name.
 *
 * Design principles:
 *  - Parameterised queries ONLY — no string interpolation of user input.
 *  - Normalise: lowercase, strip dashes/spaces from CNIC, handle Urdu variants.
 *  - Target: < 300 ms with 5,000 bookings (covered by existing indexes).
 *  - Filters: status, month, date range (booking/delivery/returning), city, cast.
 *  - Filters never saved — stateless per call.
 */

const { requireRole, ROLES } = require('../auth/roles');
const { normalizeName } = require('../domain/normalize');

function createSearchService(db) {

  /**
   * Normalize a CNIC string for comparison (strip dashes and spaces).
   * "35202-1234567-9" → "3520212345679"
   */
  function normalizeCnic(v) {
    if (!v) return '';
    return String(v).replace(/[-\s]/g, '').toLowerCase();
  }

  /**
   * Normalize a phone for comparison (strip spaces, dashes, +92 prefix).
   */
  function normalizePhone(v) {
    if (!v) return '';
    return String(v).replace(/[\s\-+]/g, '').replace(/^92/, '0');
  }

  /**
   * Global search across all bookings.
   *
   * @param {object} session
   * @param {object} filters
   * @param {string}       [filters.q]             - free-text search
   * @param {string}       [filters.status]         - None | Open | Pending | Closed
   * @param {string}       [filters.month]          - YYYY-MM
   * @param {string}       [filters.dateFrom]       - YYYY-MM-DD
   * @param {string}       [filters.dateTo]         - YYYY-MM-DD
   * @param {string}       [filters.dateField]      - 'booking_date' | 'delivery_date' | 'returning_date'
   * @param {number}       [filters.cityId]
   * @param {number}       [filters.castId]
   * @param {number}       [filters.limit=100]
   * @param {number}       [filters.offset=0]
   * @returns {Array}
   */
  function search(session, {
    q = '',
    status = '',
    month = '',
    dateFrom = '',
    dateTo = '',
    dateField = 'booking_date',   // which date column to filter on
    cityId = null,
    castId = null,
    limit = 100,
    offset = 0,
  } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    // ── Free-text search ───────────────────────────────────────────────────
    if (q && q.trim()) {
      const raw = q.trim();
      const like = `%${normalizeName(raw)}%`;
      const rawLike = `%${raw}%`;
      const cnicNorm = `%${normalizeCnic(raw)}%`;
      const phoneNorm = `%${normalizePhone(raw)}%`;

      // Booking no (numeric)
      const bookingNo = parseInt(raw, 10);

      // We search across multiple fields. Using OR group.
      const searchConditions = [];
      const searchParams = [];

      // Booking number exact or partial
      if (!isNaN(bookingNo)) {
        searchConditions.push('CAST(b.booking_no AS TEXT) LIKE ?');
        searchParams.push(`%${bookingNo}%`);
      }

      // Customer fields
      searchConditions.push(
        // Name normalized
        `lower(replace(replace(replace(cu.name,' ',''),'-',''),'_','')) LIKE ?`,
        // Raw name
        `cu.name LIKE ?`,
        // Phone1 (normalized)
        `replace(replace(cu.phone,' ',''),'-','') LIKE ?`,
        // Phone2
        `replace(replace(cu.phone2,' ',''),'-','') LIKE ?`,
        // CNIC (strip dashes)
        `replace(replace(cu.cnic,' ',''),'-','') LIKE ?`,
      );
      searchParams.push(like, rawLike, phoneNorm, phoneNorm, cnicNorm);

      // Relative name
      searchConditions.push(`b.relative_name LIKE ?`);
      searchParams.push(rawLike);

      // City
      searchConditions.push(`ci.name LIKE ?`);
      searchParams.push(rawLike);

      // Cast
      searchConditions.push(`ca.name LIKE ?`);
      searchParams.push(rawLike);

      // Dress name (via booking_items sub-query)
      searchConditions.push(`EXISTS (
        SELECT 1 FROM booking_items bi
        WHERE bi.booking_id = b.id
          AND bi.deleted_at IS NULL
          AND bi.dress_name_snapshot LIKE ?
      )`);
      searchParams.push(rawLike);

      conditions.push(`(${searchConditions.join(' OR ')})`);
      params.push(...searchParams);
    }

    // ── Status filter ──────────────────────────────────────────────────────
    if (status && status.trim()) {
      conditions.push('b.status = ?');
      params.push(status.trim());
    }

    // ── Month filter ───────────────────────────────────────────────────────
    if (month && month.trim()) {
      conditions.push('b.booking_month = ?');
      params.push(month.trim());
    }

    // ── Date range filter ─────────────────────────────────────────────────
    const allowedDateFields = ['booking_date', 'delivery_date', 'returning_date'];
    const safeField = allowedDateFields.includes(dateField) ? dateField : 'booking_date';

    if (dateFrom && dateFrom.trim()) {
      conditions.push(`b.${safeField} >= ?`);
      params.push(dateFrom.trim());
    }
    if (dateTo && dateTo.trim()) {
      conditions.push(`b.${safeField} <= ?`);
      params.push(dateTo.trim());
    }

    // ── City filter ────────────────────────────────────────────────────────
    if (cityId) {
      conditions.push('b.city_id = ?');
      params.push(parseInt(cityId, 10));
    }

    // ── Cast filter ────────────────────────────────────────────────────────
    if (castId) {
      conditions.push('cu.cast_id = ?');
      params.push(parseInt(castId, 10));
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.id,
        b.booking_no,
        b.status,
        b.booking_date,
        b.delivery_date,
        b.returning_date,
        b.delivered_on,
        b.returned_on,
        b.return_condition,
        b.booking_month,
        b.grand_total,
        b.amount_paid,
        b.remaining,
        b.discount,
        b.notes,
        cu.id   AS customer_id,
        cu.name AS customer_name,
        cu.phone AS customer_phone,
        cu.phone2 AS customer_phone2,
        cu.cnic AS customer_cnic,
        ci.name AS city,
        ca.name AS cast,
        (
          SELECT group_concat(dress_name_snapshot, ', ')
          FROM booking_items
          WHERE booking_id = b.id AND deleted_at IS NULL
        ) AS dresses_summary,
        b.created_at,
        b.updated_at
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      LEFT JOIN casts     ca ON ca.id = cu.cast_id
      WHERE ${where}
      ORDER BY b.booking_no DESC
      LIMIT ? OFFSET ?
    `).all(...params, Math.min(limit, 500), offset);

    return rows;
  }

  /**
   * Count total results for pagination (same filters, no LIMIT).
   */
  function count(session, filters = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const {
      q = '', status = '', month = '', dateFrom = '', dateTo = '',
      dateField = 'booking_date', cityId = null, castId = null,
    } = filters;

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    if (q && q.trim()) {
      const raw = q.trim();
      const like = `%${normalizeName(raw)}%`;
      const rawLike = `%${raw}%`;
      const cnicNorm = `%${normalizeCnic(raw)}%`;
      const phoneNorm = `%${normalizePhone(raw)}%`;
      const bookingNo = parseInt(raw, 10);
      const searchConditions = [];
      const searchParams = [];
      if (!isNaN(bookingNo)) { searchConditions.push('CAST(b.booking_no AS TEXT) LIKE ?'); searchParams.push(`%${bookingNo}%`); }
      searchConditions.push(
        `lower(replace(replace(replace(cu.name,' ',''),'-',''),'_','')) LIKE ?`,
        `cu.name LIKE ?`,
        `replace(replace(cu.phone,' ',''),'-','') LIKE ?`,
        `replace(replace(cu.phone2,' ',''),'-','') LIKE ?`,
        `replace(replace(cu.cnic,' ',''),'-','') LIKE ?`,
        `b.relative_name LIKE ?`,
        `ci.name LIKE ?`,
        `ca.name LIKE ?`,
        `EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id AND bi.deleted_at IS NULL AND bi.dress_name_snapshot LIKE ?)`,
      );
      searchParams.push(like, rawLike, phoneNorm, phoneNorm, cnicNorm, rawLike, rawLike, rawLike, rawLike);
      conditions.push(`(${searchConditions.join(' OR ')})`);
      params.push(...searchParams);
    }
    if (status) { conditions.push('b.status = ?'); params.push(status); }
    if (month) { conditions.push('b.booking_month = ?'); params.push(month); }
    const allowedFields = ['booking_date', 'delivery_date', 'returning_date'];
    const sf = allowedFields.includes(dateField) ? dateField : 'booking_date';
    if (dateFrom) { conditions.push(`b.${sf} >= ?`); params.push(dateFrom); }
    if (dateTo)   { conditions.push(`b.${sf} <= ?`); params.push(dateTo); }
    if (cityId)   { conditions.push('b.city_id = ?'); params.push(parseInt(cityId, 10)); }
    if (castId)   { conditions.push('cu.cast_id = ?'); params.push(parseInt(castId, 10)); }

    const where = conditions.join(' AND ');
    const row = db.prepare(`
      SELECT COUNT(*) AS n
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities    ci ON ci.id = b.city_id
      LEFT JOIN casts     ca ON ca.id = cu.cast_id
      WHERE ${where}
    `).get(...params);

    return { total: row?.n ?? 0 };
  }

  return { search, count };
}

module.exports = { createSearchService };
