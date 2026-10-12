/**
 * electron/reports/service.js
 *
 * Phase 10 — Reports Engine for Ifrah Collection POS.
 *
 * Implements:
 *  - Delivery Sheet (today, tomorrow, next 2 days, custom range)
 *  - Prepare & Dry-Clean List (dresses leaving in next 2 days + returned dresses needing cleaning)
 *  - Returns Due and Overdue (with exact days late)
 *  - Customer Report (BDRCustomer replacement with full totals)
 *  - Customers This Month (unique customers & city breakdown)
 *  - Today's Open Accounts
 *  - Daily Cash by Method (Owner only)
 *  - Outstanding Balances (Owner only, oldest delivery first)
 *  - Dress Utilization & Conflict Report
 *  - Daily Pack bundle (single-click daily operations pack)
 *  - Export Everything (Owner only 5-tab workbook data generator)
 *
 * Role guards enforced:
 *  - Cashier: Operational reports allowed. Financial reports forbidden.
 *  - Viewer: Read-only access to operational reports.
 *  - Owner: Full access to all reports & exports.
 */

const fs = require('fs');
const { requireRole, ROLES } = require('../auth/roles');
const { buildExcelReport, buildFullSystemExcel } = require('./excel');
const { renderReportHtml } = require('./template');

let BrowserWindow, dialog;
try {
  const electron = require('electron');
  BrowserWindow = electron.BrowserWindow;
  dialog = electron.dialog;
} catch { }

function createReportsService(db, settingsService) {

  function getTodayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function getTomorrowIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function getNext2DaysIso() {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }

  function getDaysLate(returningDate, today) {
    if (!returningDate || !today) return 0;
    const r = new Date(returningDate + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    const diff = Math.floor((t - r) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ─── 1. DELIVERY SHEET ────────────────────────────────────────────────────
  function getDeliverySheet(session, {
    range = 'today',
    filter = null,
    search = '',
    excludeDelivered = false,
    dateFrom = null,
    dateTo = null,
    cityId = null,
  } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const activeFilter = filter || range || 'today';
    const today = getTodayIso();
    let startDate = today;
    let endDate = today;
    let subtitle = `Deliveries scheduled for ${today}`;
    let filtersSummary = `Date: ${today}`;

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    if (activeFilter === 'tomorrow') {
      startDate = getTomorrowIso();
      endDate = startDate;
      conditions.push('b.delivery_date = ?');
      params.push(startDate);
      subtitle = `Deliveries scheduled for tomorrow (${startDate})`;
      filtersSummary = `Tomorrow: ${startDate}`;
    } else if (activeFilter === 'next2days') {
      startDate = today;
      endDate = getNext2DaysIso();
      conditions.push('b.delivery_date >= ? AND b.delivery_date <= ?');
      params.push(startDate, endDate);
      subtitle = `Deliveries scheduled from ${startDate} to ${endDate}`;
      filtersSummary = `Next 2 Days: ${startDate} to ${endDate}`;
    } else if (activeFilter === 'upcoming') {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      startDate = today;
      endDate = future.toISOString().slice(0, 10);
      conditions.push('b.delivery_date >= ? AND b.delivery_date <= ?');
      params.push(startDate, endDate);
      subtitle = `Deliveries scheduled from ${startDate} to ${endDate}`;
      filtersSummary = `Next 7 Days: ${startDate} to ${endDate}`;
    } else if ((activeFilter === 'custom' || range === 'custom') && dateFrom) {
      startDate = dateFrom;
      endDate = dateTo || dateFrom;
      conditions.push('b.delivery_date >= ? AND b.delivery_date <= ?');
      params.push(startDate, endDate);
      subtitle = `Deliveries scheduled from ${startDate} to ${endDate}`;
      filtersSummary = `Range: ${startDate} to ${endDate}`;
    } else if (activeFilter === 'pending') {
      conditions.push('b.delivered_on IS NULL');
      subtitle = 'All Pending Deliveries (تمام غیر مکمل شدہ ڈلیوریز)';
      filtersSummary = 'Status: Pending';
    } else if (activeFilter === 'delivered') {
      conditions.push('b.delivered_on IS NOT NULL');
      subtitle = 'Delivered Bookings Record (مکمل شدہ ڈلیوری ریکارڈ)';
      filtersSummary = 'Status: Delivered';
    } else if (activeFilter === 'all') {
      subtitle = 'All Deliveries Record (تمام ڈلیوری ریکارڈ)';
      filtersSummary = 'Status: All (Sabhi)';
    } else {
      // today or default
      startDate = today;
      endDate = today;
      conditions.push('b.delivery_date >= ? AND b.delivery_date <= ?');
      params.push(startDate, endDate);
      subtitle = `Deliveries scheduled for ${today}`;
      filtersSummary = `Today: ${today}`;
    }

    if (excludeDelivered && activeFilter !== 'delivered' && activeFilter !== 'pending') {
      conditions.push('b.delivered_on IS NULL');
    }

    if (cityId) {
      conditions.push('b.city_id = ?');
      params.push(cityId);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        CAST(b.booking_no AS TEXT) LIKE ?
        OR cu.name LIKE ? OR cu.phone LIKE ? OR cu.cnic LIKE ?
      )`);
      params.push(q, q, q, q);
      filtersSummary += ` • Search: "${search.trim()}"`;
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.delivery_date, b.returning_date, b.delivered_on, b.delivery_note,
        b.grand_total, b.amount_paid, b.remaining, b.security_deposit,
        cu.name AS customer_name, cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        cu.relative_name, rt.name AS relation_type,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN relation_types rt ON rt.id = cu.relation_type_id
      LEFT JOIN cities ci ON ci.id = b.city_id
      WHERE ${where}
      ORDER BY b.delivery_date ASC, b.booking_no ASC
    `).all(...params);

    // Get line details for each booking
    const getItems = db.prepare(`
      SELECT id, dress_name_snapshot, size, quantity, rate, line_total,
             jewellery, clutch_purse, hand_bag, double_dupatta, shoes,
             is_ready, item_condition
      FROM booking_items
      WHERE booking_id = ? AND deleted_at IS NULL
      ORDER BY line_no ASC
    `);

    const enrichedRows = rows.map(r => {
      const items = getItems.all(r.id);
      const isDelivered = Boolean(r.delivered_on);
      const remainingDue = Number(r.remaining || 0);
      const grandTotalNum = Number(r.grand_total || 0);
      const secDepositNum = Number(r.security_deposit || 0);

      // Legacy string
      const itemsDetail = items.map(it => {
        const acc = [];
        if (it.jewellery) acc.push('Jewellery');
        if (it.clutch_purse) acc.push('Purse');
        if (it.hand_bag) acc.push('Bag');
        if (it.double_dupatta) acc.push('2x Dupatta');
        if (it.shoes) acc.push('Shoes');
        const accStr = acc.length > 0 ? ` [${acc.join(', ')}]` : '';
        return `${it.dress_name_snapshot}${it.size ? ` (${it.size})` : ''}${accStr}`;
      }).join(' • ');

      // Plain text representations for Excel
      const bookingDisplayText = `#${r.booking_no}${r.status ? `\n${r.status}` : ''}`;
      const customerDisplayText = [r.customer_name, r.customer_phone, r.city].filter(Boolean).join('\n');
      const deliveryDateDisplayText = `${r.delivery_date}${r.delivered_on ? `\nDelivered: ${r.delivered_on}` : ''}`;
      const returnDateDisplayText = r.returning_date || '—';

      const itemsTextList = items.map(it => {
        const checkMark = it.is_ready ? '☑' : '☐';
        const sizeStr = it.size ? ` (${it.size})` : '';
        const readyTag = it.is_ready ? ' [Ready]' : '';
        const acc = [];
        if (it.jewellery) acc.push('Jewellery');
        if (it.clutch_purse) acc.push('Purse');
        if (it.hand_bag) acc.push('Bag');
        if (it.double_dupatta) acc.push('2x Dupatta');
        if (it.shoes) acc.push('Shoes');
        const accStr = acc.length > 0 ? ` [${acc.join(', ')}]` : '';
        return `${checkMark} ${it.dress_name_snapshot}${sizeStr}${accStr}${readyTag}`;
      }).join('\n');

      const dressesPrepDisplayText = [
        itemsTextList || r.dresses_summary || 'Koi dress nahi',
        r.delivery_note ? `Note: ${r.delivery_note}` : ''
      ].filter(Boolean).join('\n');

      const paymentDueDisplayText = [
        remainingDue > 0 ? `Due: Rs. ${remainingDue.toLocaleString()}` : 'Fully Paid ✓',
        `Total: Rs. ${grandTotalNum.toLocaleString()}`,
        secDepositNum > 0 ? `Deposit: Rs. ${secDepositNum.toLocaleString()}` : ''
      ].filter(Boolean).join('\n');

      const statusDisplayText = isDelivered ? 'Delivered' : 'Pending';

      // HTML representations for PDF
      const bookingDisplayHtml = `
        <div style="font-family: monospace; font-weight: 800; color: #6d28d9; font-size: 11.5px;">#${escapeHtml(r.booking_no)}</div>
        ${r.status ? `<div style="font-size: 9px; color: #64748b; margin-top: 1px;">${escapeHtml(r.status)}</div>` : ''}
      `;

      const customerDisplayHtml = `
        <div style="font-weight: 700; color: #0f172a; font-size: 10.5px;">${escapeHtml(r.customer_name || '—')}</div>
        ${r.customer_phone ? `<div style="font-family: monospace; font-size: 9.5px; color: #475569; margin-top: 1px;">📞 ${escapeHtml(r.customer_phone)}</div>` : ''}
        ${r.city ? `<div style="font-size: 9px; color: #64748b; margin-top: 1px;">${escapeHtml(r.city)}</div>` : ''}
      `;

      const deliveryDateDisplayHtml = `
        <div style="font-weight: 600; color: #1e293b; font-size: 10.5px;">${escapeHtml(r.delivery_date || '—')}</div>
        ${r.delivered_on ? `<div style="font-size: 8.5px; color: #16a34a; font-weight: 600; margin-top: 2px;">✓ Delivered: ${escapeHtml(r.delivered_on)}</div>` : ''}
      `;

      const returningDateHtml = `
        <div style="color: #334155; font-size: 10.5px;">${escapeHtml(r.returning_date || '—')}</div>
      `;

      const dressesPrepHtml = `
        <div>
          ${items.length > 0 ? items.map(it => {
            const isReady = Boolean(it.is_ready);
            const checkIcon = isReady ? '☑' : '☐';
            const sizeStr = it.size ? ` (${escapeHtml(it.size)})` : '';
            const acc = [];
            if (it.jewellery) acc.push('Jewellery');
            if (it.clutch_purse) acc.push('Purse');
            if (it.hand_bag) acc.push('Bag');
            if (it.double_dupatta) acc.push('2x Dupatta');
            if (it.shoes) acc.push('Shoes');
            const accStr = acc.length > 0 ? ` <span style="font-size: 8.5px; color: #64748b;">[${escapeHtml(acc.join(', '))}]</span>` : '';
            const readyBadge = isReady ? ` <span style="font-size: 8.5px; font-weight: 700; color: #059669; background: #d1fae5; padding: 1px 5px; border-radius: 4px;">Ready</span>` : '';
            return `<div style="margin-bottom: 2px; font-size: 9.5px; line-height: 1.3;">
              <span style="font-size: 10px; color: ${isReady ? '#059669' : '#64748b'};">${checkIcon}</span>
              <span style="font-weight: ${isReady ? '700' : '500'}; color: ${isReady ? '#065f46' : '#1e293b'};">${escapeHtml(it.dress_name_snapshot)}${sizeStr}${accStr}${readyBadge}</span>
            </div>`;
          }).join('') : `<span style="color: #64748b; font-size: 9.5px;">${escapeHtml(r.dresses_summary || 'Koi dress nahi')}</span>`}
          ${r.delivery_note ? `<div style="font-size: 8.5px; color: #64748b; font-style: italic; margin-top: 2px;">Note: ${escapeHtml(r.delivery_note)}</div>` : ''}
        </div>
      `;

      const paymentDueDisplayHtml = `
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 11px; color: ${remainingDue > 0 ? '#dc2626' : '#16a34a'};">
            ${remainingDue > 0 ? `Rs. ${remainingDue.toLocaleString()}` : 'Fully Paid ✓'}
          </div>
          <div style="font-size: 9px; color: #64748b; margin-top: 1px;">
            Total: Rs. ${grandTotalNum.toLocaleString()}
          </div>
          ${secDepositNum > 0 ? `<div style="font-size: 8.5px; color: #7c3aed; margin-top: 1px;">Deposit: Rs. ${secDepositNum.toLocaleString()}</div>` : ''}
        </div>
      `;

      const statusDisplayHtml = `
        <span class="badge-status ${isDelivered ? 'badge-closed' : 'badge-pending'}">
          ${isDelivered ? 'Delivered' : 'Pending'}
        </span>
      `;

      return {
        ...r,
        items,
        dresses_detailed: itemsDetail || r.dresses_summary || '—',
        relative_info: r.relative_name ? `${r.relative_name} (${r.relation_type || 'Relative'})` : '—',
        is_delivered_text: r.delivered_on ? `Yes (${r.delivered_on})` : 'Pending',

        // Field keys matching the exact 7 UI columns
        booking_display: bookingDisplayText,
        customer_display: customerDisplayText,
        delivery_date_display: deliveryDateDisplayText,
        returning_date: returnDateDisplayText,
        dresses_prep_display: dressesPrepDisplayText,
        payment_due_display: paymentDueDisplayText,
        status_display: statusDisplayText,

        // HTML versions for PDF
        booking_display_html: bookingDisplayHtml,
        customer_display_html: customerDisplayHtml,
        delivery_date_display_html: deliveryDateDisplayHtml,
        returning_date_html: returningDateHtml,
        dresses_prep_display_html: dressesPrepHtml,
        payment_due_display_html: paymentDueDisplayHtml,
        status_display_html: statusDisplayHtml,
      };
    });

    const totalRemaining = enrichedRows.reduce((sum, r) => sum + (r.remaining || 0), 0);
    const totalGrand = enrichedRows.reduce((sum, r) => sum + (r.grand_total || 0), 0);
    const totalPaid = enrichedRows.reduce((sum, r) => sum + (r.amount_paid || 0), 0);

    return {
      reportType: 'delivery_sheet',
      title: 'Daily Delivery Sheet (ڈلیوری شیٹ)',
      subtitle,
      filtersSummary,
      orientation: 'landscape',
      columns: [
        { header: 'BOOKING #', key: 'booking_display', width: 14, align: 'center', isText: true },
        { header: 'CUSTOMER', key: 'customer_display', width: 28, align: 'left', isText: true },
        { header: 'DELIVERY DATE', key: 'delivery_date_display', width: 16, align: 'center', isText: true },
        { header: 'RETURN DATE', key: 'returning_date', width: 16, align: 'center', isText: true },
        { header: 'DRESSES & PREPARATION (NIGHT-BEFORE READY)', key: 'dresses_prep_display', width: 44, align: 'left', isText: true },
        { header: 'PAYMENT DUE', key: 'payment_due_display', width: 22, align: 'right', isText: true },
        { header: 'STATUS', key: 'status_display', width: 14, align: 'center', isText: true },
      ],
      rows: enrichedRows,
      totals: {
        booking_display: `${enrichedRows.length} Bookings`,
        customer_display: '',
        delivery_date_display: '',
        returning_date: '',
        dresses_prep_display: '',
        payment_due_display: `Remaining: Rs. ${totalRemaining.toLocaleString()}\nTotal: Rs. ${totalGrand.toLocaleString()}`,
        payment_due_display_html: `<div style="text-align: right;"><div style="font-weight: 800; color: ${totalRemaining > 0 ? '#dc2626' : '#16a34a'};">Due: Rs. ${totalRemaining.toLocaleString()}</div><div style="font-size: 9.5px; color: #64748b;">Total: Rs. ${totalGrand.toLocaleString()}</div></div>`,
        status_display: '',

        // Preserved for tests and reports
        booking_no: `${enrichedRows.length} Bookings`,
        total_items: enrichedRows.reduce((sum, r) => sum + (r.items ? r.items.length : 1), 0),
        grand_total: totalGrand,
        amount_paid: totalPaid,
        remaining: totalRemaining,
      },
    };
  }

  // ─── 2. PREPARE & DRY-CLEAN LIST ──────────────────────────────────────────
  function getPrepareDryCleanList(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const today = getTodayIso();
    const next2Days = getNext2DaysIso();

    // A. Dresses to Prepare (Leaving in next 2 days and not delivered yet)
    const prepItems = db.prepare(`
      SELECT
        'PREPARE' AS section,
        'Dresses Leaving in 2 Days' AS section_name,
        b.booking_no, b.delivery_date AS date_target,
        cu.name AS customer_name, cu.phone AS customer_phone,
        bi.id AS item_id, bi.dress_name_snapshot, bi.size,
        bi.jewellery, bi.clutch_purse, bi.hand_bag, bi.double_dupatta, bi.shoes,
        bi.is_ready, bi.item_condition,
        b.remaining
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      WHERE b.deleted_at IS NULL
        AND bi.deleted_at IS NULL
        AND b.delivered_on IS NULL
        AND b.delivery_date >= ? AND b.delivery_date <= ?
      ORDER BY b.delivery_date ASC, b.booking_no ASC
    `).all(today, next2Days);

    // B. Dresses Returned Needing Cleaning/Repair
    const cleanItems = db.prepare(`
      SELECT
        'CLEANING' AS section,
        'Returned Needing Dry-Clean / Repair' AS section_name,
        b.booking_no, b.returned_on AS date_target,
        cu.name AS customer_name, cu.phone AS customer_phone,
        bi.id AS item_id, bi.dress_name_snapshot, bi.size,
        bi.jewellery, bi.clutch_purse, bi.hand_bag, bi.double_dupatta, bi.shoes,
        bi.is_ready,
        COALESCE(b.return_condition, bi.item_condition, 'Needs cleaning') AS item_condition,
        b.return_damage_note AS notes,
        b.remaining
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      WHERE b.deleted_at IS NULL
        AND bi.deleted_at IS NULL
        AND b.returned_on IS NOT NULL
        AND (b.return_condition IN ('Needs cleaning', 'Damaged') OR bi.item_condition IN ('Needs cleaning', 'Damaged'))
      ORDER BY b.returned_on DESC, b.booking_no ASC
    `).all();

    const allRows = [...prepItems, ...cleanItems].map(r => {
      const acc = [];
      if (r.jewellery) acc.push('Jewellery');
      if (r.clutch_purse) acc.push('Purse');
      if (r.hand_bag) acc.push('Bag');
      if (r.double_dupatta) acc.push('2x Dupatta');
      if (r.shoes) acc.push('Shoes');

      return {
        ...r,
        accessories: acc.join(', ') || 'None',
        is_ready_text: r.is_ready ? 'Ready' : 'Pending',
      };
    });

    return {
      reportType: 'prepare_dryclean',
      title: 'Prepare & Dry-Clean List (تیاری اور ڈرائی کلین لسٹ)',
      subtitle: `Dresses leaving in next 2 days (${today} to ${next2Days}) & returned dresses needing dry-clean`,
      filtersSummary: `As of ${today}`,
      columns: [
        { header: 'Section', key: 'section_name', width: 24 },
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Target Date', key: 'date_target', width: 14 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'Dress Name', key: 'dress_name_snapshot', width: 26 },
        { header: 'Size', key: 'size', width: 10 },
        { header: 'Accessories', key: 'accessories', width: 18 },
        { header: 'Prep Status', key: 'is_ready_text', width: 12 },
        { header: 'Condition / Note', key: 'item_condition', width: 20 },
      ],
      rows: allRows,
      totals: {
        section_name: `Total Items: ${allRows.length}`,
        dress_name_snapshot: `${prepItems.length} To Prepare • ${cleanItems.length} Needs Clean`,
      },
    };
  }

  // ─── 3. RETURNS DUE AND OVERDUE ───────────────────────────────────────────
  function getReturnsDueAndOverdue(session, { filter = 'all' } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const today = getTodayIso();
    const conditions = ['b.deleted_at IS NULL', 'b.delivered_on IS NOT NULL', 'b.returned_on IS NULL'];
    const params = [];

    if (filter === 'overdue_only') {
      conditions.push('b.returning_date < ?');
      params.push(today);
    } else if (filter === 'today_only') {
      conditions.push('b.returning_date = ?');
      params.push(today);
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.delivery_date, b.delivered_on, b.returning_date,
        b.grand_total, b.amount_paid, b.remaining, b.security_deposit,
        cu.name AS customer_name, cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities ci ON ci.id = b.city_id
      WHERE ${where}
      ORDER BY
        CASE WHEN b.returning_date < '${today}' THEN 1 ELSE 2 END ASC,
        b.returning_date ASC, b.booking_no ASC
    `).all(...params);

    const enriched = rows.map(r => {
      const isOverdue = r.returning_date && r.returning_date < today;
      const daysLate = isOverdue ? getDaysLate(r.returning_date, today) : 0;
      return {
        ...r,
        is_overdue: isOverdue,
        days_late: daysLate,
        status_label: isOverdue ? `${daysLate} din LATE` : 'Due Today / Upcoming',
      };
    });

    const totalDeposit = enriched.reduce((s, r) => s + (r.security_deposit || 0), 0);
    const totalRemaining = enriched.reduce((s, r) => s + (r.remaining || 0), 0);
    const overdueCount = enriched.filter(r => r.is_overdue).length;

    return {
      reportType: 'returns_overdue',
      title: 'Returns Due and Overdue Report (واپسی اور اوور ڈیو رپورٹ)',
      subtitle: `Dresses awaiting return as of ${today} (${overdueCount} Overdue)`,
      filtersSummary: `As of ${today}`,
      columns: [
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Customer', key: 'customer_name', width: 22 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'Delivered On', key: 'delivered_on', width: 14 },
        { header: 'Expected Return', key: 'returning_date', width: 14 },
        { header: 'Overdue Status', key: 'status_label', width: 18 },
        { header: 'Dresses', key: 'dresses_summary', width: 28 },
        { header: 'Security Deposit', key: 'security_deposit', isMoney: true, width: 16 },
        { header: 'Remaining Due', key: 'remaining', isMoney: true, width: 16 },
      ],
      rows: enriched,
      totals: {
        booking_no: `${enriched.length} Awaiting Return`,
        status_label: `${overdueCount} Overdue`,
        security_deposit: totalDeposit,
        remaining: totalRemaining,
      },
    };
  }

  // ─── 4. CUSTOMER REPORT (BDRCustomer Replacement) ─────────────────────────
  function getCustomerReport(session, { month = '', cityId = null, status = '', dateFrom = '', dateTo = '' } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];

    if (month && month.trim()) {
      conditions.push('b.booking_month = ?');
      params.push(month.trim());
    }
    if (cityId) {
      conditions.push('b.city_id = ?');
      params.push(cityId);
    }
    if (status && status.trim()) {
      conditions.push('b.status = ?');
      params.push(status.trim());
    }
    if (dateFrom && dateFrom.trim()) {
      conditions.push('b.delivery_date >= ?');
      params.push(dateFrom.trim());
    }
    if (dateTo && dateTo.trim()) {
      conditions.push('b.delivery_date <= ?');
      params.push(dateTo.trim());
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.booking_date, b.delivery_date, b.returning_date,
        b.booking_month, b.status,
        b.grand_total, b.amount_paid, b.remaining, b.discount, b.security_deposit,
        cu.name AS customer_name, cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities ci ON ci.id = b.city_id
      WHERE ${where}
      ORDER BY b.booking_no DESC
    `).all(...params);

    const totalGrand = rows.reduce((s, r) => s + (r.grand_total || 0), 0);
    const totalPaid = rows.reduce((s, r) => s + (r.amount_paid || 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + (r.remaining || 0), 0);

    return {
      reportType: 'customer_report',
      title: 'Customer Bookings Report (کسٹمر رپورٹ - BDRCustomer)',
      subtitle: `Complete bookings ledger with customer contact and payment balances`,
      filtersSummary: [
        month ? `Month: ${month}` : '',
        status ? `Status: ${status}` : '',
        dateFrom ? `From: ${dateFrom}` : '',
        dateTo ? `To: ${dateTo}` : '',
      ].filter(Boolean).join(' • ') || 'All Bookings',
      columns: [
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Booking Date', key: 'booking_date', width: 14 },
        { header: 'Delivery Date', key: 'delivery_date', width: 14 },
        { header: 'Return Date', key: 'returning_date', width: 14 },
        { header: 'Customer', key: 'customer_name', width: 22 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'CNIC', key: 'customer_cnic', isText: true, width: 18 },
        { header: 'City', key: 'city', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Dresses', key: 'dresses_summary', width: 28 },
        { header: 'Grand Total', key: 'grand_total', isMoney: true, width: 16 },
        { header: 'Paid', key: 'amount_paid', isMoney: true, width: 16 },
        { header: 'Remaining', key: 'remaining', isMoney: true, width: 16 },
      ],
      rows,
      totals: {
        booking_no: `${rows.length} Bookings`,
        grand_total: totalGrand,
        amount_paid: totalPaid,
        remaining: totalRemaining,
      },
    };
  }

  // ─── 5. CUSTOMERS THIS MONTH ──────────────────────────────────────────────
  function getCustomersThisMonth(session, { month = '' } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const targetMonth = month && month.trim() ? month.trim() : new Date().toISOString().slice(0, 7);

    const rows = db.prepare(`
      SELECT
        cu.id AS customer_id,
        cu.name AS customer_name,
        cu.phone AS customer_phone,
        cu.cnic AS customer_cnic,
        ci.name AS city,
        COUNT(b.id) AS bookings_in_month,
        SUM(b.grand_total) AS total_spent_in_month,
        SUM(b.amount_paid) AS total_paid_in_month,
        SUM(b.remaining) AS total_remaining_in_month
      FROM customers cu
      JOIN bookings b ON b.customer_id = cu.id
      LEFT JOIN cities ci ON ci.id = cu.city_id
      WHERE b.deleted_at IS NULL AND b.booking_month = ?
      GROUP BY cu.id
      ORDER BY bookings_in_month DESC, total_spent_in_month DESC
    `).all(targetMonth);

    // City counts breakdown
    const citySummary = db.prepare(`
      SELECT
        COALESCE(ci.name, 'Unknown') AS city,
        COUNT(DISTINCT cu.id) AS unique_customers,
        COUNT(b.id) AS total_bookings
      FROM bookings b
      JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities ci ON ci.id = cu.city_id
      WHERE b.deleted_at IS NULL AND b.booking_month = ?
      GROUP BY ci.id
      ORDER BY total_bookings DESC
    `).all(targetMonth);

    const totalBookings = rows.reduce((s, r) => s + (r.bookings_in_month || 0), 0);
    const totalSpent = rows.reduce((s, r) => s + (r.total_spent_in_month || 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + (r.total_remaining_in_month || 0), 0);

    return {
      reportType: 'customers_month',
      title: 'Customers This Month (اس مہینے کے کسٹمرز)',
      subtitle: `Unique customer activity and city breakdown for ${targetMonth}`,
      filtersSummary: `Month: ${targetMonth} • ${rows.length} Unique Customers • ${totalBookings} Bookings`,
      columns: [
        { header: 'Customer', key: 'customer_name', width: 22 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'CNIC', key: 'customer_cnic', isText: true, width: 18 },
        { header: 'City', key: 'city', width: 14 },
        { header: 'Bookings in Month', key: 'bookings_in_month', isNum: true, width: 18 },
        { header: 'Total Value', key: 'total_spent_in_month', isMoney: true, width: 16 },
        { header: 'Total Paid', key: 'total_paid_in_month', isMoney: true, width: 16 },
        { header: 'Remaining Balance', key: 'total_remaining_in_month', isMoney: true, width: 16 },
      ],
      rows,
      citySummary,
      totals: {
        customer_name: `${rows.length} Unique Customers`,
        bookings_in_month: totalBookings,
        total_spent_in_month: totalSpent,
        total_remaining_in_month: totalRemaining,
      },
    };
  }

  // ─── 6. TODAY'S OPEN ACCOUNTS ─────────────────────────────────────────────
  function getTodayOpenAccounts(session, { date = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const targetDate = date || getTodayIso();

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.delivery_date, b.returning_date, b.delivered_on,
        b.grand_total, b.amount_paid, b.remaining, b.security_deposit,
        cu.name AS customer_name, cu.phone AS customer_phone,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities ci ON ci.id = b.city_id
      WHERE b.deleted_at IS NULL
        AND b.delivery_date = ?
        AND b.status = 'Open'
      ORDER BY b.booking_no ASC
    `).all(targetDate);

    const totalGrand = rows.reduce((s, r) => s + (r.grand_total || 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + (r.remaining || 0), 0);

    return {
      reportType: 'today_open_accounts',
      title: "Today's Open Accounts (آج کے اوپن اکاؤنٹس)",
      subtitle: `Open bookings whose dresses go out today (${targetDate})`,
      filtersSummary: `Date: ${targetDate} • Status: Open`,
      columns: [
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Customer', key: 'customer_name', width: 22 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'City', key: 'city', width: 14 },
        { header: 'Dresses', key: 'dresses_summary', width: 28 },
        { header: 'Expected Return', key: 'returning_date', width: 14 },
        { header: 'Grand Total', key: 'grand_total', isMoney: true, width: 16 },
        { header: 'Paid', key: 'amount_paid', isMoney: true, width: 16 },
        { header: 'Remaining Due', key: 'remaining', isMoney: true, width: 16 },
      ],
      rows,
      totals: {
        booking_no: `${rows.length} Open Accounts`,
        grand_total: totalGrand,
        remaining: totalRemaining,
      },
    };
  }

  // ─── 7. DAILY CASH BY METHOD (OWNER ONLY) ─────────────────────────────────
  function getDailyCash(session, { dateFrom = null, dateTo = null } = {}) {
    requireRole(session, [ROLES.OWNER]);

    const today = getTodayIso();
    const startDate = dateFrom || today;
    const endDate = dateTo || startDate;

    const rows = db.prepare(`
      SELECT
        p.id, p.booking_id, b.booking_no,
        p.amount, p.payment_method, p.kind, p.paid_on, p.note,
        cu.name AS customer_name,
        u.full_name AS cashier_name
      FROM payments p
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN users u ON u.id = p.received_by
      WHERE p.paid_on >= ? AND p.paid_on <= ?
        AND p.is_void = 0
      ORDER BY p.paid_on ASC, p.id ASC
    `).all(startDate, endDate);

    // Grouping by method and kind
    let totalCash = 0;
    let totalBank = 0;
    let totalRental = 0;
    let totalDepositIn = 0;
    let totalDepositRefund = 0;

    rows.forEach(r => {
      const amt = Number(r.amount || 0);
      if (r.payment_method === 'cash') totalCash += amt;
      else totalBank += amt;

      if (r.kind === 'rental') totalRental += amt;
      else if (r.kind === 'deposit') totalDepositIn += amt;
      else if (r.kind === 'deposit_refund') totalDepositRefund += amt;
    });

    const netTotal = totalCash + totalBank - totalDepositRefund;

    return {
      reportType: 'daily_cash',
      title: 'Daily Cash by Method (روزانہ کیش و بینک رپورٹ - Owner Only)',
      subtitle: `Collections from ${startDate} to ${endDate}`,
      filtersSummary: `Range: ${startDate} to ${endDate}`,
      columns: [
        { header: 'Payment ID', key: 'id', isNum: true, width: 12 },
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Date', key: 'paid_on', width: 14 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Amount', key: 'amount', isMoney: true, width: 16 },
        { header: 'Method', key: 'payment_method', width: 14 },
        { header: 'Kind', key: 'kind', width: 16 },
        { header: 'Cashier / Received By', key: 'cashier_name', width: 18 },
        { header: 'Notes', key: 'note', width: 24 },
      ],
      rows,
      summary: {
        totalCash,
        totalBank,
        totalRental,
        totalDepositIn,
        totalDepositRefund,
        netTotal,
      },
      totals: {
        booking_no: `${rows.length} Payments`,
        amount: totalCash + totalBank,
        payment_method: `Cash: ${totalCash.toLocaleString()} • Bank: ${totalBank.toLocaleString()}`,
      },
    };
  }

  // ─── 8. OUTSTANDING BALANCES (OWNER ONLY) ─────────────────────────────────
  function getOutstandingBalances(session) {
    requireRole(session, [ROLES.OWNER]);

    const today = getTodayIso();

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.delivery_date, b.returning_date, b.delivered_on, b.returned_on,
        b.grand_total, b.amount_paid, b.remaining,
        cu.name AS customer_name, cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities ci ON ci.id = b.city_id
      WHERE b.deleted_at IS NULL
        AND b.remaining > 0
        AND b.status != 'Closed'
      ORDER BY b.delivery_date ASC, b.booking_no ASC
    `).all();

    const enriched = rows.map(r => {
      let daysSince = 0;
      if (r.delivery_date) {
        daysSince = getDaysLate(r.delivery_date, today);
      }
      return {
        ...r,
        days_since_delivery: daysSince > 0 ? `${daysSince} din pehle` : 'Upcoming',
      };
    });

    const totalRemaining = enriched.reduce((s, r) => s + (r.remaining || 0), 0);
    const totalGrand = enriched.reduce((s, r) => s + (r.grand_total || 0), 0);

    return {
      reportType: 'outstanding_balances',
      title: 'Outstanding Balances Report (بقایا جات کی رپورٹ - Owner Only)',
      subtitle: `All uncollected customer balances sorted oldest delivery first`,
      filtersSummary: `As of ${today} • Remaining > 0`,
      columns: [
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Delivery Date', key: 'delivery_date', width: 14 },
        { header: 'Age / Days', key: 'days_since_delivery', width: 16 },
        { header: 'Customer', key: 'customer_name', width: 22 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'City', key: 'city', width: 14 },
        { header: 'Dresses', key: 'dresses_summary', width: 28 },
        { header: 'Grand Total', key: 'grand_total', isMoney: true, width: 16 },
        { header: 'Paid', key: 'amount_paid', isMoney: true, width: 16 },
        { header: 'Remaining Balance', key: 'remaining', isMoney: true, width: 18 },
      ],
      rows: enriched,
      totals: {
        booking_no: `${enriched.length} Debtor Accounts`,
        grand_total: totalGrand,
        remaining: totalRemaining,
      },
    };
  }

  // ─── 9. DRESS REPORT ──────────────────────────────────────────────────────
  function getDressReport(session, { dateFrom = '', dateTo = '' } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['b.deleted_at IS NULL', 'bi.deleted_at IS NULL'];
    const params = [];

    if (dateFrom) {
      conditions.push('b.delivery_date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('b.delivery_date <= ?');
      params.push(dateTo);
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.booking_no, b.status, b.delivery_date, b.returning_date,
        cu.name AS customer_name, cu.phone AS customer_phone,
        bi.id AS item_id, bi.dress_id, bi.dress_name_snapshot, bi.size,
        bi.quantity, bi.rate, bi.line_total,
        bi.jewellery, bi.clutch_purse, bi.hand_bag, bi.double_dupatta, bi.shoes,
        (
          SELECT COUNT(*)
          FROM booking_items bi2
          JOIN bookings b2 ON b2.id = bi2.booking_id
          WHERE bi2.dress_id = bi.dress_id
            AND bi2.id != bi.id
            AND b2.deleted_at IS NULL
            AND bi2.deleted_at IS NULL
            AND b2.status != 'Closed'
            AND b2.delivery_date = b.delivery_date
        ) AS duplicate_same_date_count
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      WHERE ${where}
      ORDER BY bi.dress_name_snapshot ASC, b.delivery_date ASC
    `).all(...params);

    const enriched = rows.map(r => {
      const acc = [];
      if (r.jewellery) acc.push('Jewellery');
      if (r.clutch_purse) acc.push('Purse');
      if (r.hand_bag) acc.push('Bag');
      if (r.double_dupatta) acc.push('2x Dupatta');
      if (r.shoes) acc.push('Shoes');

      return {
        ...r,
        accessories: acc.join(', ') || 'None',
        clash_warning: r.duplicate_same_date_count > 0 ? `⚠️ Clash (${r.duplicate_same_date_count} duplicate)` : 'OK',
      };
    });

    return {
      reportType: 'dress_report',
      title: 'Dress Utilization & Clash Report (ڈریس رپورٹ)',
      subtitle: `Each booking's dress lines with accessories and duplicate date detection`,
      filtersSummary: dateFrom ? `From: ${dateFrom} to ${dateTo || 'End'}` : 'All Bookings',
      columns: [
        { header: 'Dress Name', key: 'dress_name_snapshot', width: 26 },
        { header: 'Size', key: 'size', width: 10 },
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Delivery Date', key: 'delivery_date', width: 14 },
        { header: 'Return Date', key: 'returning_date', width: 14 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
        { header: 'Accessories', key: 'accessories', width: 18 },
        { header: 'Rate', key: 'rate', isMoney: true, width: 14 },
        { header: 'Same-Day Clash', key: 'clash_warning', width: 18 },
      ],
      rows: enriched,
      totals: {
        dress_name_snapshot: `Total Items: ${enriched.length}`,
      },
    };
  }

  // ─── 10. EXPORT EVERYTHING TO EXCEL DATA GENERATOR (OWNER ONLY) ───────────
  function getSystemExportData(session) {
    requireRole(session, [ROLES.OWNER]);

    const bookings = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.booking_date, b.delivery_date, b.returning_date,
        b.delivered_on, b.returned_on, b.return_condition,
        b.grand_total, b.amount_paid, b.remaining, b.security_deposit, b.notes,
        cu.name AS customer_name, cu.phone AS customer_phone, cu.cnic AS customer_cnic,
        ci.name AS city,
        (SELECT group_concat(dress_name_snapshot, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN cities ci ON ci.id = b.city_id
      WHERE b.deleted_at IS NULL
      ORDER BY b.booking_no ASC
    `).all();

    const items = db.prepare(`
      SELECT
        bi.id, bi.booking_id, b.booking_no, bi.line_no,
        bi.dress_name_snapshot, bi.size, bi.quantity, bi.rate, bi.line_total,
        bi.jewellery, bi.clutch_purse, bi.is_ready, bi.item_condition
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.deleted_at IS NULL AND b.deleted_at IS NULL
      ORDER BY b.booking_no ASC, bi.line_no ASC
    `).all();

    const payments = db.prepare(`
      SELECT
        p.id, p.booking_id, b.booking_no, p.amount, p.payment_method,
        p.kind, p.paid_on, p.is_void, p.void_reason, p.note
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      ORDER BY p.id ASC
    `).all();

    const customers = db.prepare(`
      SELECT
        cu.id, cu.name, cu.phone, cu.phone2, cu.cnic,
        ci.name AS city, ca.name AS cast,
        cu.relative_name, rt.name AS relation_type, cu.address,
        (SELECT COUNT(*) FROM bookings WHERE customer_id = cu.id AND deleted_at IS NULL) AS booking_count
      FROM customers cu
      LEFT JOIN cities ci ON ci.id = cu.city_id
      LEFT JOIN casts ca ON ca.id = cu.cast_id
      LEFT JOIN relation_types rt ON rt.id = cu.relation_type_id
      WHERE cu.deleted_at IS NULL
      ORDER BY cu.id ASC
    `).all();

    const dresses = db.prepare(`
      SELECT
        d.id, d.code, d.name, d.size, d.rental_price, d.active,
        cat.name AS category,
        (SELECT COUNT(*) FROM booking_items WHERE dress_id = d.id AND deleted_at IS NULL) AS times_booked
      FROM dresses d
      LEFT JOIN dress_categories cat ON cat.id = d.category_id
      WHERE d.deleted_at IS NULL
      ORDER BY d.id ASC
    `).all();

    return {
      bookings,
      items,
      payments,
      customers,
      dresses,
    };
  }

  // ─── 11. DAILY PACK BUNDLE ────────────────────────────────────────────────
  function getDailyPack(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const deliverySheet = getDeliverySheet(session, { range: 'next2days' });
    const prepareList = getPrepareDryCleanList(session);
    const returnsList = getReturnsDueAndOverdue(session);

    return {
      title: 'Rozana Ka Pack (Daily 3-in-1 Operations Pack)',
      subtitle: 'Agley 2 Din Ki Delivery, Tayari List, Wapsi / Overdue',
      generatedAt: new Date().toISOString(),
      deliverySheet,
      prepareList,
      returnsList,
      columns: [
        { key: 'section', label: 'Section / Report' },
        { key: 'records', label: 'Kul Records' },
        { key: 'summary', label: 'Khulasa' },
      ],
      rows: [
        { section: '1. Agley 2 Din Ki Delivery', records: deliverySheet.rows.length, summary: `${deliverySheet.totals.total_items || 0} Jore / Items` },
        { section: '2. Agley 3 Din Ki Tayari (Dry Clean/Press)', records: prepareList.rows.length, summary: `${prepareList.totals.total_items || 0} Jore Tayar Karne Hain` },
        { section: '3. Wapsi / Overdue Suits', records: returnsList.rows.length, summary: `${returnsList.totals.total_overdue || 0} Overdue / Latkay Huay Jore` },
      ],
      totals: {
        total_sections: 3,
        total_records: deliverySheet.rows.length + prepareList.rows.length + returnsList.rows.length,
      },
      filtersSummary: 'Mukammal Rozana Operational Pack',
    };
  }

  // ─── REPORT DATA DISPATCHER ──────────────────────────────────────────────
  function getReportData(session, { reportType, filters = {} }) {
    switch (reportType) {
      case 'delivery_sheet':
        return getDeliverySheet(session, filters);
      case 'prepare_dryclean':
        return getPrepareDryCleanList(session, filters);
      case 'returns_overdue':
        return getReturnsDueAndOverdue(session, filters);
      case 'customer_report':
        return getCustomerReport(session, filters);
      case 'customers_month':
        return getCustomersThisMonth(session, filters);
      case 'today_open_accounts':
        return getTodayOpenAccounts(session, filters);
      case 'daily_cash':
        return getDailyCash(session, filters);
      case 'outstanding_balances':
        return getOutstandingBalances(session, filters);
      case 'dress_report':
        return getDressReport(session, filters);
      case 'daily_pack':
        return getDailyPack(session);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  // ─── GENERATE REPORT HTML (FOR PRINT & PDF) ───────────────────────────────
  async function generateReportHtml(session, { reportType, filters = {} }) {
    const reportData = getReportData(session, { reportType, filters });
    const settings = settingsService ? settingsService.getSettings(session) : {};
    const generatedBy = session?.user?.full_name || session?.user?.username || 'Staff';

    const html = renderReportHtml({
      reportType,
      title: reportData.title,
      subtitle: reportData.subtitle,
      filtersSummary: reportData.filtersSummary,
      columns: reportData.columns,
      rows: reportData.rows,
      totals: reportData.totals,
      settings,
      generatedBy,
    });

    return {
      ok: true,
      html,
      reportData,
    };
  }

  // ─── EXPORT TO EXCEL ──────────────────────────────────────────────────────
  async function exportExcel(session, { reportType, filters = {}, targetPath = null }) {
    const reportData = getReportData(session, { reportType, filters });
    const excelBuffer = await buildExcelReport({
      title: reportData.title,
      subtitle: reportData.subtitle,
      columns: reportData.columns,
      rows: reportData.rows,
      totals: reportData.totals,
    });

    let finalPath = targetPath;
    if (!finalPath && dialog) {
      const defaultFilename = `${reportType}_${getTodayIso()}.xlsx`;
      const saveRes = await dialog.showSaveDialog({
        title: `Export ${reportData.title} to Excel`,
        defaultPath: defaultFilename,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      });

      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: false, canceled: true };
      }
      finalPath = saveRes.filePath;
    }

    if (finalPath) {
      await fs.promises.writeFile(finalPath, excelBuffer);
    }

    return {
      ok: true,
      filePath: finalPath,
      buffer: finalPath ? null : excelBuffer,
      recordCount: reportData.rows.length,
    };
  }

  // ─── EXPORT EVERYTHING (5 TABS WORKBOOK - OWNER ONLY) ─────────────────────
  async function exportEverything(session, { targetPath = null } = {}) {
    requireRole(session, [ROLES.OWNER]);
    const systemData = getSystemExportData(session);
    const excelBuffer = await buildFullSystemExcel(systemData);

    let finalPath = targetPath;
    if (!finalPath && dialog) {
      const defaultFilename = `Ifrah_Collection_Full_Backup_${getTodayIso()}.xlsx`;
      const saveRes = await dialog.showSaveDialog({
        title: 'Export Everything to Excel (Full System Backup)',
        defaultPath: defaultFilename,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      });

      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: false, canceled: true };
      }
      finalPath = saveRes.filePath;
    }

    if (finalPath) {
      await fs.promises.writeFile(finalPath, excelBuffer);
    }

    return {
      ok: true,
      filePath: finalPath,
      buffer: finalPath ? null : excelBuffer,
      counts: {
        bookings: systemData.bookings.length,
        items: systemData.items.length,
        payments: systemData.payments.length,
        customers: systemData.customers.length,
        dresses: systemData.dresses.length,
      },
    };
  }

  // ─── EXPORT AS PDF ────────────────────────────────────────────────────────
  async function exportPdf(session, { reportType, filters = {}, targetPath = null }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const { html, reportData } = await generateReportHtml(session, { reportType, filters });

    if (!BrowserWindow) {
      return { ok: true, html, recordCount: reportData.rows?.length || 0 };
    }

    return new Promise((resolve, reject) => {
      let win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });

      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      win.webContents.once('did-finish-load', async () => {
        try {
          const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            landscape: reportData.columns?.length >= 7 || reportData.orientation === 'landscape' || reportType === 'delivery_sheet',
            margins: { marginType: 'none' },
          });
          try { win.destroy(); win = null; } catch { }

          let finalPath = targetPath;
          if (!finalPath && dialog) {
            const defaultFilename = `${reportType}_${getTodayIso()}.pdf`;
            const saveRes = await dialog.showSaveDialog({
              title: `Save ${reportData.title} as PDF`,
              defaultPath: defaultFilename,
              filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
            });

            if (saveRes.canceled || !saveRes.filePath) {
              return resolve({ ok: false, canceled: true });
            }
            finalPath = saveRes.filePath;
          }

          if (finalPath) {
            await fs.promises.writeFile(finalPath, pdfBuffer);
          }

          resolve({ ok: true, filePath: finalPath, recordCount: reportData.rows?.length || 0 });
        } catch (err) {
          try { if (win) win.destroy(); } catch { }
          reject(err);
        }
      });

      win.webContents.once('did-fail-load', (_e, code, desc) => {
        try { win.destroy(); win = null; } catch { }
        reject(new Error(`Failed to load report HTML for PDF: ${desc} (${code})`));
      });
    });
  }

  // ─── PRINT DIRECT (ELECTRON WEBCONTENTS PRINT) ────────────────────────────
  async function printDirect(session, { reportType, filters = {}, printerName = '', silent = false }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    const { html, reportData } = await generateReportHtml(session, { reportType, filters });

    if (!BrowserWindow) return { ok: true, simulated: true };

    return new Promise((resolve, reject) => {
      let win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });

      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      win.webContents.once('did-finish-load', () => {
        const printOptions = {
          silent: Boolean(silent || printerName),
          printBackground: true,
          pageSize: 'A4',
          landscape: reportData.columns?.length > 7,
          margins: { marginType: 'none' },
        };
        if (printerName) printOptions.deviceName = printerName;

        win.webContents.print(printOptions, (success, failureReason) => {
          try { win.destroy(); win = null; } catch { }
          if (!success) {
            reject(new Error(failureReason || 'Print canceled or failed.'));
          } else {
            resolve({ ok: true, reportType });
          }
        });
      });

      win.webContents.once('did-fail-load', (_e, code, desc) => {
        try { win.destroy(); win = null; } catch { }
        reject(new Error(`Failed to load report HTML for printing: ${desc} (${code})`));
      });
    });
  }

  // ─── PRINT DAILY PACK ─────────────────────────────────────────────────────
  async function printDailyPack(session, { printerName = '', silent = false } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);
    await printDirect(session, { reportType: 'delivery_sheet', filters: { range: 'next2days' }, printerName, silent });
    await printDirect(session, { reportType: 'prepare_dryclean', filters: {}, printerName, silent });
    await printDirect(session, { reportType: 'returns_overdue', filters: {}, printerName, silent });
    return { ok: true, message: 'Daily pack 3 reports sent to printer.' };
  }

  return {
    getDeliverySheet,
    getPrepareDryCleanList,
    getReturnsDueAndOverdue,
    getCustomerReport,
    getCustomersThisMonth,
    getTodayOpenAccounts,
    getDailyCash,
    getOutstandingBalances,
    getDressReport,
    getSystemExportData,
    getDailyPack,
    getReportData,
    generateReportHtml,
    exportExcel,
    exportEverything,
    exportPdf,
    printDirect,
    printDailyPack,
  };
}

module.exports = {
  createReportsService,
};
