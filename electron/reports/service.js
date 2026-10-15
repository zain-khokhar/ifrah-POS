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

  function formatDateDDMMYYYY(val) {
    if (!val) return null;
    try {
      if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        const d = String(val.getDate()).padStart(2, '0');
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const y = val.getFullYear();
        return `${d}-${m}-${y}`;
      }
      const s = String(val).trim();
      if (!s) return null;
      const dateOnly = s.split('T')[0].split(' ')[0];
      const parts = dateOnly.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
          return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
        }
        if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
          return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
        }
      }
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const dStr = String(d.getDate()).padStart(2, '0');
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        return `${dStr}-${mStr}-${d.getFullYear()}`;
      }
      return s;
    } catch {
      return null;
    }
  }

  function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    const dateOnly = s.split('T')[0].split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        return isNaN(d.getTime()) ? null : d;
      }
      if (parts[0].length === 4) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return isNaN(d.getTime()) ? null : d;
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function toIsoDate(val) {
    if (!val) return null;
    const s = String(val).trim();
    const dateOnly = s.split('T')[0].split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateOnly;
  }

  function getDaysLate(returningDate, today) {
    if (!returningDate || !today) return 0;
    const r = parseDate(returningDate);
    const t = parseDate(today);
    if (!r || !t) return 0;
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
    readinessFilter = null, // 'fully_ready' | 'pending_ready' | null
    statusFilter = null,    // 'pending' | 'delivered' | null — combines with custom range
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
      if (statusFilter === 'pending') {
        conditions.push('b.delivered_on IS NULL');
        subtitle += ' (Pending only)';
        filtersSummary += ' • Status: Pending';
      } else if (statusFilter === 'delivered') {
        conditions.push('b.delivered_on IS NOT NULL');
        subtitle += ' (Delivered only)';
        filtersSummary += ' • Status: Delivered';
      }
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

    if (excludeDelivered && activeFilter !== 'delivered' && activeFilter !== 'pending' && !statusFilter) {
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
        b.id, b.booking_no, b.status, b.booking_date,
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
      SELECT bi.id, bi.dress_name_snapshot, bi.size, bi.quantity, bi.rate, bi.line_total,
             bi.jewellery, bi.clutch_purse, bi.hand_bag, bi.double_dupatta, bi.shoes,
             bi.attachments,
             bi.is_ready, bi.item_condition,
             bi.dress_id,
             COALESCE(d.condition_status, bi.item_condition, 'fresh') AS dress_condition_status
      FROM booking_items bi
      LEFT JOIN dresses d ON d.id = bi.dress_id AND d.deleted_at IS NULL
      WHERE bi.booking_id = ? AND bi.deleted_at IS NULL
      ORDER BY bi.line_no ASC
    `);

    const enrichedRows = rows.map(r => {
      const items = getItems.all(r.id);
      const isDelivered = Boolean(r.delivered_on);
      const remainingDue = Number(r.remaining || 0);
      const grandTotalNum = Number(r.grand_total || 0);
      const secDepositNum = Number(r.security_deposit || 0);

      // Readiness derived values
      const readyItemCount = items.filter(it => it.is_ready).length;
      const isFullyReady = items.length > 0 && readyItemCount === items.length;

      /**
       * Parse attachments for a booking item.
       * New bookings: stored as JSON array in `it.attachments`
       * Old bookings: stored as boolean columns (jewellery, clutch_purse, etc.)
       * Returns a plain string array e.g. ['Belt', 'Crown', 'Dupatta']
       */
      function getAcc(it) {
        // 1. Try new JSON attachments column first
        if (it.attachments) {
          try {
            const parsed = typeof it.attachments === 'string'
              ? JSON.parse(it.attachments)
              : it.attachments;
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map(s => String(s).trim()).filter(Boolean);
            }
          } catch (_) {
            // fall through to CSV parse
            const csv = String(it.attachments).split(',').map(s => s.trim()).filter(Boolean);
            if (csv.length > 0) return csv;
          }
        }
        // 2. Fall back to legacy boolean columns
        const acc = [];
        if (it.jewellery) acc.push('Jewellery');
        if (it.clutch_purse) acc.push('Purse');
        if (it.hand_bag) acc.push('Bag');
        if (it.double_dupatta) acc.push('2x Dupatta');
        if (it.shoes) acc.push('Shoes');
        return acc;
      }

      // Helper for condition text and html badge
      function getCondBadgeHtml(status) {
        const s = String(status || 'fresh').toLowerCase();
        let label = 'Fresh';
        let color = '#1d4ed8';
        let bg = '#dbeafe';
        let border = '#93c5fd';

        if (s === 'good') {
          label = 'Good';
          color = '#15803d';
          bg = '#dcfce7';
          border = '#86efac';
        } else if (s === 'need_dry_clean' || s.includes('dry')) {
          label = 'Dry-Clean';
          color = '#b45309';
          bg = '#fef3c7';
          border = '#fde68a';
        } else if (s === 'need_repair' || s.includes('repair') || s.includes('damage')) {
          label = 'Repair';
          color = '#b91c1c';
          bg = '#fee2e2';
          border = '#fca5a5';
        } else if (s !== 'fresh') {
          label = status;
          color = '#64748b';
          bg = '#f1f5f9';
          border = '#e2e8f0';
        }

        return `<span style="font-size:8px;font-weight:700;color:${color};background:${bg};border:1px solid ${border};border-radius:4px;padding:1px 5px;white-space:nowrap;">${escapeHtml(label)}</span>`;
      }

      function getCondText(status) {
        const s = String(status || 'fresh').toLowerCase();
        if (s === 'good') return ' [Good]';
        if (s === 'need_dry_clean' || s.includes('dry')) return ' [Dry-Clean]';
        if (s === 'need_repair' || s.includes('repair') || s.includes('damage')) return ' [Repair]';
        return ' [Fresh]';
      }

      // Legacy string
      const itemsDetail = items.map(it => {
        const acc = getAcc(it);
        const accStr = acc.length > 0 ? ` [${acc.join(', ')}]` : '';
        const condStr = getCondText(it.dress_condition_status);
        return `${it.dress_name_snapshot}${it.size ? ` (${it.size})` : ''}${condStr}${accStr}`;
      }).join(' • ');

      // Plain text representations for Excel
      const bookingDateText = r.booking_date || '—';
      const bookingDateHtml = `<div style="color: #334155; font-size: 10.5px;">${escapeHtml(r.booking_date || '—')}</div>`;
      const bookingDisplayText = `#${r.booking_no}${r.status ? `\n${r.status}` : ''}`;
      const customerDisplayText = [r.customer_name, r.customer_phone, r.city].filter(Boolean).join('\n');
      const delDateStr = formatDateDDMMYYYY(r.delivery_date) || r.delivery_date || '—';
      const delOnStr = r.delivered_on ? formatDateDDMMYYYY(r.delivered_on) || r.delivered_on : '';
      const deliveryDateDisplayText = `${delDateStr}${delOnStr ? `\nDelivered: ${delOnStr}` : ''}`;
      const returnDateDisplayText = formatDateDDMMYYYY(r.returning_date) || r.returning_date || '—';

      const itemsTextList = items.map(it => {
        const checkMark = it.is_ready ? '☑' : '☐';
        const sizeStr = it.size ? ` (${it.size})` : '';
        const condTag = getCondText(it.dress_condition_status);
        const readyTag = it.is_ready ? ' [Ready]' : '';
        const acc = getAcc(it);
        const accStr = acc.length > 0 ? `\n  • ${acc.join(', ')}` : '';
        return `${checkMark} ${it.dress_name_snapshot}${sizeStr}${condTag}${readyTag}${accStr}`;
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

      const statusDisplayText = isDelivered
        ? 'Delivered'
        : (isFullyReady ? 'Fully Ready' : 'Pending');

      // HTML representations for PDF
      const bookingDisplayHtml = `
        <div style="font-family: monospace; font-weight: 800; color: #6d28d9; font-size: 11.5px;">#${escapeHtml(r.booking_no)}</div>
        ${r.status ? `<div style="font-size: 9px; color: #64748b; margin-top: 1px;">${escapeHtml(r.status)}</div>` : ''}
      `;

      const customerDisplayHtml = `
        <div style="font-weight: 700; color: #0f172a; font-size: 10.5px;">${escapeHtml(r.customer_name || '—')}</div>
        ${r.customer_phone ? `<div style="font-family: monospace; font-size: 9.5px; color: #475569; margin-top: 1px;">${escapeHtml(r.customer_phone)}</div>` : ''}
        ${r.city ? `<div style="font-size: 9px; color: #64748b; margin-top: 1px;">${escapeHtml(r.city)}</div>` : ''}
      `;

      const deliveryDateDisplayHtml = `
        <div style="font-weight: 600; color: #1e293b; font-size: 10.5px;">${escapeHtml(formatDateDDMMYYYY(r.delivery_date) || r.delivery_date || '—')}</div>
        ${r.delivered_on ? `<div style="font-size: 8.5px; color: #16a34a; font-weight: 600; margin-top: 2px;">✓ Delivered: ${escapeHtml(formatDateDDMMYYYY(r.delivered_on) || r.delivered_on)}</div>` : ''}
      `;

      const returningDateHtml = `
        <div style="color: #334155; font-size: 10.5px;">${escapeHtml(formatDateDDMMYYYY(r.returning_date) || r.returning_date || '—')}</div>
      `;

      const dressesPrepHtml = `
        <div>
          ${items.length > 0 ? items.map(it => {
        const isReady = Boolean(it.is_ready);
        const checkIcon = isReady ? '&#9745;' : '&#9744;';
        const sizeStr = it.size ? ` (${escapeHtml(it.size)})` : '';
        const acc = getAcc(it);
        const accBadges = acc.length > 0
          ? `<div style="margin-top:2px;margin-left:14px;display:flex;flex-wrap:wrap;gap:3px;">${acc.map(a => `<span style="font-size:8px;color:#6d28d9;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:4px;padding:1px 5px;font-weight:600;">&bull; ${escapeHtml(a)}</span>`).join('')}</div>`
          : '';
        const condBadge = getCondBadgeHtml(it.dress_condition_status);
        const readyBadge = isReady ? ` <span style="font-size:8.5px;font-weight:700;color:#059669;background:#d1fae5;padding:1px 5px;border-radius:4px;">Ready</span>` : '';
        return `<div style="margin-bottom:4px;padding:3px 5px;border-radius:4px;background:${isReady ? '#ecfdf5' : '#f8fafc'};border:1px solid ${isReady ? '#a7f3d0' : '#e2e8f0'};">
              <div style="display:flex;align-items:center;gap:4px;font-size:9.5px;line-height:1.3;flex-wrap:wrap;">
                <span style="font-size:10px;color:${isReady ? '#059669' : '#64748b'};">${checkIcon}</span>
                <span style="font-weight:${isReady ? '700' : '500'};color:${isReady ? '#065f46' : '#1e293b'};">${escapeHtml(it.dress_name_snapshot)}${sizeStr}</span>
                ${condBadge}
                ${readyBadge}
              </div>
              ${accBadges}
            </div>`;
      }).join('') : `<span style="color:#64748b;font-size:9.5px;">${escapeHtml(r.dresses_summary || 'Koi dress nahi')}</span>`}
          ${r.delivery_note ? `<div style="font-size:8.5px;color:#64748b;font-style:italic;margin-top:2px;">Note: ${escapeHtml(r.delivery_note)}</div>` : ''}
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

      const statusDisplayHtml = isDelivered
        ? `<span class="badge-status badge-closed">Delivered</span>`
        : isFullyReady
          ? `<span class="badge-status badge-ready" style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;">Fully Ready</span>`
          : `<span class="badge-status badge-pending">Pending Ready</span>`;

      return {
        ...r,
        items,
        dresses_detailed: itemsDetail || r.dresses_summary || '—',
        relative_info: r.relative_name ? `${r.relative_name} (${r.relation_type || 'Relative'})` : '—',
        is_delivered_text: r.delivered_on ? `Yes (${r.delivered_on})` : 'Pending',

        // Field keys matching the exact 7 UI columns
        booking_display: bookingDisplayText,
        booking_date_display: bookingDateText,
        booking_date_display_html: bookingDateHtml,
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

    // Apply readiness sub-filter (if requested)
    let finalRows = enrichedRows;
    if (readinessFilter === 'fully_ready') {
      finalRows = enrichedRows.filter(r => r.all_ready === true ||
        (r.total_items > 0 && r.ready_items === r.total_items));
      filtersSummary += ' • Readiness: Fully Ready Only';
    } else if (readinessFilter === 'pending_ready') {
      finalRows = enrichedRows.filter(r => !(r.all_ready === true ||
        (r.total_items > 0 && r.ready_items === r.total_items)));
      filtersSummary += ' • Readiness: Pending Ready Only';
    }

    const totalRemaining = finalRows.reduce((sum, r) => sum + (r.remaining || 0), 0);
    const totalGrand = finalRows.reduce((sum, r) => sum + (r.grand_total || 0), 0);
    const totalPaid = finalRows.reduce((sum, r) => sum + (r.amount_paid || 0), 0);

    // Swap enrichedRows → finalRows in return
    const enrichedRows2 = finalRows;

    return {
      reportType: 'delivery_sheet',
      title: 'Daily Delivery Sheet (ڈلیوری شیٹ)',
      subtitle,
      filtersSummary,
      orientation: 'landscape',
      columns: [
        { header: 'BOOKING #', key: 'booking_display', width: 14, align: 'center', isText: true },
        { header: 'BOOKING DATE', key: 'booking_date_display', width: 14, align: 'center', isText: true },
        { header: 'CUSTOMER', key: 'customer_display', width: 28, align: 'left', isText: true },
        { header: 'DELIVERY DATE', key: 'delivery_date_display', width: 16, align: 'center', isText: true },
        { header: 'RETURN DATE', key: 'returning_date', width: 16, align: 'center', isText: true },
        { header: 'DRESSES & PREPARATION (NIGHT-BEFORE READY)', key: 'dresses_prep_display', width: 44, align: 'left', isText: true },
        { header: 'PAYMENT DUE', key: 'payment_due_display', width: 22, align: 'right', isText: true },
        { header: 'STATUS', key: 'status_display', width: 14, align: 'center', isText: true },
      ],
      rows: enrichedRows2,
      totals: {
        booking_display: `${enrichedRows2.length} Bookings`,
        booking_date_display: '',
        customer_display: '',
        delivery_date_display: '',
        returning_date: '',
        dresses_prep_display: '',
        payment_due_display: `Remaining: Rs. ${totalRemaining.toLocaleString()}\nTotal: Rs. ${totalGrand.toLocaleString()}`,
        payment_due_display_html: `<div style="text-align: right;"><div style="font-weight: 800; color: ${totalRemaining > 0 ? '#dc2626' : '#16a34a'};">Due: Rs. ${totalRemaining.toLocaleString()}</div><div style="font-size: 9.5px; color: #64748b;">Total: Rs. ${totalGrand.toLocaleString()}</div></div>`,
        status_display: '',

        // Preserved for tests and reports
        booking_no: `${enrichedRows2.length} Bookings`,
        total_items: enrichedRows2.reduce((sum, r) => sum + (r.items ? r.items.length : 1), 0),
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
        bi.id AS item_id, bi.dress_id, bi.dress_name_snapshot, bi.size,
        bi.jewellery, bi.clutch_purse, bi.hand_bag, bi.double_dupatta, bi.shoes,
        bi.is_ready,
        COALESCE(b.return_condition, bi.item_condition, 'Need Dry Clean') AS item_condition,
        b.return_damage_note AS notes,
        b.remaining,
        d.condition_status AS dress_condition_status
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      LEFT JOIN customers cu ON cu.id = b.customer_id
      LEFT JOIN dresses d ON d.id = bi.dress_id
      WHERE b.deleted_at IS NULL
        AND bi.deleted_at IS NULL
        AND b.returned_on IS NOT NULL
        AND (
          b.return_condition IN ('Need Dry Clean', 'Need Repair', 'Needs cleaning', 'Damaged')
          OR bi.item_condition IN ('Need Dry Clean', 'Need Repair', 'Needs cleaning', 'Damaged')
          OR d.condition_status IN ('need_dry_clean', 'need_repair')
        )
        AND (d.condition_status IS NULL OR d.condition_status IN ('need_dry_clean', 'need_repair'))
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

  // ─── 3b. RETURNS TRACKER (mirrors Returns page filters) ───────────────────
  function getReturnsTracker(session, { filter = 'all', search = '', dateFrom = null, dateTo = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const today = getTodayIso();
    const conditions = ['b.deleted_at IS NULL'];
    const params = [];
    let label = 'Sabhi Returns';

    if (filter === 'overdue') {
      conditions.push('b.delivered_on IS NOT NULL AND b.returned_on IS NULL AND b.returning_date < ?');
      params.push(today);
      label = 'Overdue Only';
    } else if (filter === 'due_today') {
      conditions.push('b.returning_date = ? AND b.returned_on IS NULL');
      params.push(today);
      label = `Aaj Due (${today})`;
    } else if (filter === 'returned') {
      conditions.push('b.returned_on IS NOT NULL');
      label = 'Returned';
    } else if (filter === 'pending') {
      conditions.push('b.returned_on IS NULL');
      label = 'Pending Return';
    } else if (filter === 'custom' && dateFrom) {
      const to = dateTo || dateFrom;
      conditions.push('b.returning_date >= ? AND b.returning_date <= ?');
      params.push(dateFrom, to);
      label = `Custom Date: ${dateFrom} to ${to}`;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(CAST(b.booking_no AS TEXT) LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ? OR cu.cnic LIKE ?)');
      params.push(q, q, q, q);
      label += ` • Search: "${search.trim()}"`;
    }

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.delivered_on, b.returning_date, b.returned_on,
        b.return_condition, b.return_damage_note,
        b.remaining, b.security_deposit,
        cu.name AS customer_name, cu.phone AS customer_phone,
        (SELECT group_concat(dress_name_snapshot || ' x' || quantity, ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.returning_date ASC, b.booking_no ASC
    `).all(...params);

    const enriched = rows.map(r => {
      const isOverdue = Boolean(r.delivered_on && !r.returned_on && r.returning_date && r.returning_date < today);
      const daysLate = isOverdue ? getDaysLate(r.returning_date, today) : 0;
      return {
        ...r,
        customer_phone: r.customer_phone || '',
        delivered_on: r.delivered_on || 'Not delivered',
        returned_on: r.returned_on || '—',
        return_condition: r.returned_on ? (r.return_condition || 'Good') : '—',
        return_damage_note: r.return_damage_note || '',
        status_label: r.returned_on ? 'Returned' : isOverdue ? `${daysLate} din LATE` : 'Awaiting Return',
      };
    });

    const totalRemaining = enriched.reduce((s, r) => s + (r.remaining || 0), 0);
    const totalDeposit = enriched.reduce((s, r) => s + (r.security_deposit || 0), 0);

    return {
      reportType: 'returns_tracker',
      title: 'Returns Tracker (واپسی کی رپورٹ)',
      subtitle: `Returns as of ${today} (${enriched.length} records)`,
      filtersSummary: label,
      orientation: 'landscape',
      columns: [
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 12 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Phone', key: 'customer_phone', isText: true, width: 15 },
        { header: 'Dresses', key: 'dresses_summary', width: 28 },
        { header: 'Delivered', key: 'delivered_on', width: 13 },
        { header: 'Expected Return', key: 'returning_date', width: 14 },
        { header: 'Returned On', key: 'returned_on', width: 13 },
        { header: 'Status', key: 'status_label', width: 15 },
        { header: 'Condition', key: 'return_condition', width: 14 },
        { header: 'Damage Note', key: 'return_damage_note', width: 24 },
        // { header: 'Deposit', key: 'security_deposit', isMoney: true, width: 12 },
        // { header: 'Remaining', key: 'remaining', isMoney: true, width: 12 },
      ],
      rows: enriched,
      totals: {
        booking_no: `${enriched.length} Records`,
        security_deposit: totalDeposit,
        remaining: totalRemaining,
      },
    };
  }

  // ─── 3c. DRESS CATALOGUE (mirrors Dress Catalogue page filters) ───────────
  function getDressCatalogue(session, { search = '', categoryId = null, activeOnly = false, inactiveOnly = false, conditionStatus = null } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['d.deleted_at IS NULL'];
    const params = [];
    const parts = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(d.name LIKE ? OR d.code LIKE ? OR dc.name LIKE ?)');
      params.push(q, q, q);
      parts.push(`Search: "${search.trim()}"`);
    }
    if (categoryId) {
      conditions.push('d.category_id = ?');
      params.push(categoryId);
      const cat = db.prepare('SELECT name FROM dress_categories WHERE id = ?').get(categoryId);
      parts.push(`Category: ${cat ? cat.name : categoryId}`);
    }
    if (activeOnly) {
      conditions.push('d.active = 1');
      parts.push('Active only');
    }
    if (inactiveOnly) {
      conditions.push('d.active = 0');
      parts.push('Inactive only');
    }
    if (conditionStatus) {
      conditions.push(`COALESCE(d.condition_status, 'fresh') = ?`);
      params.push(conditionStatus);
      parts.push(`Condition: ${conditionLabel(conditionStatus)}`);
    }

    function conditionLabel(s) {
      return ({ fresh: 'Fresh', good: 'Good', need_dry_clean: 'Need Dry Clean', need_repair: 'Need Repair' })[s] || s || 'Fresh';
    }

    const rows = db.prepare(`
      SELECT
        d.id, d.code, d.name, d.size, d.rental_price, d.active, d.inactive_remark, d.inactive_at,
        COALESCE(d.condition_status, 'fresh') AS condition_status,
        dc.name AS category,
        (SELECT COUNT(*) FROM booking_items bi
         JOIN bookings b ON b.id = bi.booking_id
         WHERE bi.dress_id = d.id AND bi.deleted_at IS NULL AND b.deleted_at IS NULL) AS booking_count
      FROM dresses d
      LEFT JOIN dress_categories dc ON dc.id = d.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.name COLLATE NOCASE
    `).all(...params);

    const enriched = rows.map(r => ({
      ...r,
      category: r.category || '—',
      size: r.size || '—',
      condition_label: conditionLabel(r.condition_status),
      status_label: r.active ? 'Active' : 'Inactive',
      inactive_remark: r.active ? '' : (r.inactive_remark || ''),
    }));

    const showRemark = inactiveOnly || enriched.some(r => !r.active);
    const columns = [
      { header: 'Code', key: 'code', isText: true, width: 12 },
      { header: 'Dress Name', key: 'name', width: 32 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Condition', key: 'condition_label', width: 16 },
      { header: 'Size', key: 'size', width: 10 },
      { header: 'Rate', key: 'rental_price', isMoney: true, width: 14 },
      { header: 'Bookings', key: 'booking_count', isNum: true, width: 10 },
      { header: 'Status', key: 'status_label', width: 10 },
    ];
    if (showRemark) columns.push({ header: 'Inactive Remark', key: 'inactive_remark', width: 36 });

    return {
      reportType: 'dress_catalogue',
      title: 'Dress Catalogue',
      subtitle: `${enriched.length} dresses`,
      filtersSummary: parts.length ? parts.join(' • ') : 'All Dresses',
      columns,
      rows: enriched,
      totals: { code: `${enriched.length} Dresses` },
    };
  }

  // ─── 3d. BOOKINGS REPORT (mirrors Bookings page filters) ───────────────────
  function getBookingsReport(session, {
    search = '',
    status = '',
    dateField = 'booking_date',
    dateFrom = null,
    dateTo = null,
  } = {}) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const conditions = ['b.deleted_at IS NULL'];
    const params = [];
    const parts = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        CAST(b.booking_no AS TEXT) LIKE ?
        OR cu.name LIKE ? OR cu.phone LIKE ? OR cu.cnic LIKE ?
        OR b.relative_name LIKE ?
      )`);
      params.push(q, q, q, q, q);
      parts.push(`Search: "${search.trim()}"`);
    }

    if (status) {
      conditions.push('b.status = ?');
      params.push(status);
      parts.push(`Status: ${status}`);
    }

    const fieldLabels = {
      booking_date: 'Booking Date',
      delivery_date: 'Delivery Date',
      returning_date: 'Return Date',
    };
    const colExpr = dateField === 'delivery_date'
      ? 'b.delivery_date'
      : dateField === 'returning_date'
        ? 'b.returning_date'
        : 'COALESCE(b.booking_date, substr(b.created_at, 1, 10))';

    const normColExpr = `(CASE WHEN substr(${colExpr}, 3, 1) = '-' AND substr(${colExpr}, 6, 1) = '-' THEN substr(${colExpr}, 7, 4) || '-' || substr(${colExpr}, 4, 2) || '-' || substr(${colExpr}, 1, 2) ELSE ${colExpr} END)`;

    const isoDateFrom = toIsoDate(dateFrom);
    const isoDateTo = toIsoDate(dateTo);

    if (isoDateFrom && isoDateTo && isoDateFrom === isoDateTo) {
      conditions.push(`${normColExpr} = ?`);
      params.push(isoDateFrom);
      parts.push(`${fieldLabels[dateField] || 'Date'}: ${formatDateDDMMYYYY(dateFrom)}`);
    } else {
      if (isoDateFrom) {
        conditions.push(`${normColExpr} >= ?`);
        params.push(isoDateFrom);
      }
      if (isoDateTo) {
        conditions.push(`${normColExpr} <= ?`);
        params.push(isoDateTo);
      }
      if (dateFrom && dateTo) {
        parts.push(`${fieldLabels[dateField] || 'Date'}: ${formatDateDDMMYYYY(dateFrom)} to ${formatDateDDMMYYYY(dateTo)}`);
      } else if (dateFrom) {
        parts.push(`${fieldLabels[dateField] || 'Date'}: From ${formatDateDDMMYYYY(dateFrom)}`);
      } else if (dateTo) {
        parts.push(`${fieldLabels[dateField] || 'Date'}: Upto ${formatDateDDMMYYYY(dateTo)}`);
      }
    }

    const where = conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        b.id, b.booking_no, b.status,
        b.booking_date, b.delivery_date, b.returning_date,
        b.delivered_on, b.returned_on,
        b.total_returning_days,
        b.grand_total, b.amount_paid, b.remaining,
        cu.name AS customer_name, cu.phone AS customer_phone,
        (SELECT group_concat(dress_name_snapshot || ' x' || COALESCE(quantity, 1), ', ') FROM booking_items WHERE booking_id = b.id AND deleted_at IS NULL) AS dresses_summary,
        b.created_at
      FROM bookings b
      LEFT JOIN customers cu ON cu.id = b.customer_id
      WHERE ${where}
      ORDER BY b.booking_no DESC
    `).all(...params);

    const enriched = rows.map(r => {
      let timeStr = '';
      if (r.created_at) {
        try {
          const d = new Date(r.created_at);
          if (!isNaN(d.getTime())) {
            timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          }
        } catch (e) { }
      }
      const rawDate = r.booking_date || (r.created_at ? r.created_at.slice(0, 10) : '');
      const bDate = formatDateDDMMYYYY(rawDate) || rawDate || '—';
      const bookedAt = timeStr ? `${bDate} ${timeStr}` : bDate;

      const rawDresses = r.dresses_summary || '';
      const dressList = rawDresses ? rawDresses.split(', ').map(s => s.trim()).filter(Boolean) : [];
      const dressesFormatted = dressList.length > 1
        ? dressList.map(d => `• ${d}`).join('\n')
        : (dressList[0] ? `• ${dressList[0]}` : '—');

      // Customer + Phone merged below
      const custName = r.customer_name || '—';
      const custPhone = r.customer_phone || '';
      const customerDisplayText = custPhone ? `${custName}\n${custPhone}` : custName;
      const customerDisplayHtml = `
        <div style="font-weight: 700; color: #0f172a; line-height: 1.3;">${escapeHtml(custName)}</div>
        ${custPhone ? `<div style="font-family: monospace; font-size: 9.5px; color: #475569; margin-top: 2px;">${escapeHtml(custPhone)}</div>` : ''}
      `;

      // Delivery + Return merged (DD: / RD:)
      const delDate = formatDateDDMMYYYY(r.delivery_date) || r.delivery_date || '—';
      const retDate = formatDateDDMMYYYY(r.returning_date) || r.returning_date || '—';
      const deliveryReturnText = `DD: ${delDate}\nRD: ${retDate}`;
      const deliveryReturnHtml = `
        <div style="font-size: 10px; line-height: 1.35; white-space: nowrap;">
          <div><strong style="color: #7c3aed;">DD:</strong> ${escapeHtml(delDate)}</div>
          <div style="margin-top: 2px;"><strong style="color: #0284c7;">RD:</strong> ${escapeHtml(retDate)}</div>
        </div>
      `;

      // Rental Days
      let rentalDaysVal = '—';
      if (r.delivery_date && r.returning_date) {
        const d1 = parseDate(r.delivery_date);
        const d2 = parseDate(r.returning_date);
        if (d1 && d2) {
          const diff = Math.abs(Math.round((d2 - d1) / 86400000));
          rentalDaysVal = `${diff} ${diff === 1 ? 'Day' : 'Days'}`;
        }
      } else if (r.total_returning_days != null) {
        rentalDaysVal = `${r.total_returning_days} Days`;
      }

      // Total & Paid merged
      const gTotal = Number(r.grand_total || 0);
      const aPaid = Number(r.amount_paid || 0);
      const totalPaidText = `Total: Rs. ${gTotal.toLocaleString()}\nPaid: Rs. ${aPaid.toLocaleString()}`;
      const totalPaidHtml = `
        <div style="font-size: 10px; line-height: 1.35; text-align: right; white-space: nowrap;">
          <div><span style="color: #64748b; font-size: 8.5px; font-weight: 600;">Total:</span> <strong>Rs. ${gTotal.toLocaleString()}</strong></div>
          <div style="margin-top: 2px;"><span style="color: #16a34a; font-size: 8.5px; font-weight: 600;">Paid:</span> <strong style="color: #16a34a;">Rs. ${aPaid.toLocaleString()}</strong></div>
        </div>
      `;

      return {
        ...r,
        customer_name: custName,
        customer_phone: custPhone,
        customer_display: customerDisplayText,
        customer_display_html: customerDisplayHtml,
        dresses_summary: dressesFormatted,
        booked_at: bookedAt,
        delivery_date: delDate,
        returning_date: retDate,
        delivery_return: deliveryReturnText,
        delivery_return_html: deliveryReturnHtml,
        rental_days: rentalDaysVal,
        total_paid: totalPaidText,
        total_paid_html: totalPaidHtml,
        status: r.status || 'None',
      };
    });

    const totalGrand = enriched.reduce((s, r) => s + (r.grand_total || 0), 0);
    const totalPaid = enriched.reduce((s, r) => s + (r.amount_paid || 0), 0);
    const totalRemaining = enriched.reduce((s, r) => s + (r.remaining || 0), 0);

    return {
      reportType: 'bookings_report',
      title: 'Bookings Report (بکنگز رپورٹ)',
      subtitle: `${enriched.length} bookings`,
      filtersSummary: parts.length ? parts.join(' • ') : 'All Bookings',
      orientation: 'portrait',
      columns: [
        { header: 'Booking #', key: 'booking_no', isNum: true, width: 11 },
        { header: 'Customer', key: 'customer_display', width: 22 },
        { header: 'Dresses / Ordered', key: 'dresses_summary', width: 32 },
        { header: 'Booked Date & Time', key: 'booked_at', width: 18 },
        { header: 'Delivery & Return', key: 'delivery_return', width: 16, align: 'center' },
        { header: 'Rental Days', key: 'rental_days', width: 12, align: 'center' },
        { header: 'Status', key: 'status', width: 11, align: 'center' },
        { header: 'Total & Paid (Rs)', key: 'total_paid', width: 17, align: 'right' },
        { header: 'Remaining (Rs)', key: 'remaining', isMoney: true, width: 14 },
      ],
      rows: enriched,
      totals: {
        booking_no: `${enriched.length} Bookings`,
        customer_display: '',
        total_paid: `Total: Rs. ${totalGrand.toLocaleString()}\nPaid: Rs. ${totalPaid.toLocaleString()}`,
        total_paid_html: `<div style="text-align: right; line-height: 1.35;"><div>Total: Rs. ${totalGrand.toLocaleString()}</div><div style="color: #16a34a;">Paid: Rs. ${totalPaid.toLocaleString()}</div></div>`,
        remaining: totalRemaining,
        grand_total: totalGrand,
        amount_paid: totalPaid,
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

    const enriched = rows.map(r => {
      const rawDresses = r.dresses_summary || '';
      const dressList = rawDresses ? rawDresses.split(', ').map(s => s.trim()).filter(Boolean) : [];
      const dressesFormatted = dressList.length > 1
        ? dressList.map(d => `• ${d}`).join('\n')
        : (dressList[0] ? `• ${dressList[0]}` : '—');

      return {
        ...r,
        dresses_summary: dressesFormatted,
        booking_date: formatDateDDMMYYYY(r.booking_date) || r.booking_date || '—',
        delivery_date: formatDateDDMMYYYY(r.delivery_date) || r.delivery_date || '—',
        returning_date: formatDateDDMMYYYY(r.returning_date) || r.returning_date || '—',
      };
    });

    return {
      reportType: 'customer_report',
      title: 'Customer Bookings Report (کسٹمر رپورٹ - BDRCustomer)',
      subtitle: `Complete bookings ledger with customer contact and payment balances`,
      filtersSummary: [
        month ? `Month: ${month}` : '',
        status ? `Status: ${status}` : '',
        dateFrom ? `From: ${formatDateDDMMYYYY(dateFrom)}` : '',
        dateTo ? `To: ${formatDateDDMMYYYY(dateTo)}` : '',
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
      rows: enriched,
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
      case 'returns_tracker':
        return getReturnsTracker(session, filters);
      case 'dress_catalogue':
        return getDressCatalogue(session, filters);
      case 'bookings_report':
        return getBookingsReport(session, filters);
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
      orientation: reportData.orientation || 'portrait',
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
          const isPdfLandscape = reportData.orientation === 'portrait'
            ? false
            : (reportData.orientation === 'landscape' || reportType === 'delivery_sheet');

          const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            landscape: isPdfLandscape,
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
    getReturnsTracker,
    getDressCatalogue,
    getBookingsReport,
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
