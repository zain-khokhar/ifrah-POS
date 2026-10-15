/**
 * electron/reports/template.js
 *
 * Phase 10 — Printable HTML Report Template for Print & PDF.
 * Supports A4 portrait and landscape, Urdu/English bilingual text,
 * custom shop branding, filters badge, and footer totals summary.
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount) {
  const n = Number(amount || 0);
  return 'Rs. ' + n.toLocaleString('en-PK');
}

function formatDateDDMMYYYY(val) {
  if (!val) return '—';
  try {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '—';
      const d = String(val.getDate()).padStart(2, '0');
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const y = val.getFullYear();
      return `${d}-${m}-${y}`;
    }
    const s = String(val).trim();
    if (!s) return '—';
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
    return s;
  } catch {
    return val;
  }
}

/**
 * Generate full HTML document for a report.
 *
 * @param {object} params
 * @param {string} params.reportType
 * @param {string} params.title
 * @param {string} [params.subtitle]
 * @param {string} [params.filtersSummary]
 * @param {Array<{ key: string, header: string, align?: string, isMoney?: boolean, isNum?: boolean }>} params.columns
 * @param {Array<object>} params.rows
 * @param {object} [params.totals]
 * @param {object} [params.settings] - shop settings (shop_name, shop_phone, address, etc.)
 * @param {string} [params.generatedBy] - staff username or name
 * @param {string} [params.orientation] - 'portrait' | 'landscape'
 * @returns {string} HTML string
 */
function renderReportHtml({
  reportType,
  title,
  subtitle = '',
  filtersSummary = '',
  columns = [],
  rows = [],
  totals = null,
  settings = {},
  generatedBy = 'Staff',
  orientation = 'portrait',
}) {
  const shopName = settings.shop_name || 'Ifrah Collection';
  const tagline = settings.shop_tagline || 'Exclusive Bridal & Party Wear';
  const phone = settings.shop_phone_1 || '0300-0000000';
  const address = settings.shop_address || 'Main Market, Burewala';

  const now = new Date();
  const dStr = String(now.getDate()).padStart(2, '0');
  const mStr = String(now.getMonth() + 1).padStart(2, '0');
  const yStr = now.getFullYear();
  const dateFormatted = `${dStr}-${mStr}-${yStr}`;
  const timeFormatted = now.toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const isLandscape = orientation === 'portrait' ? false : (orientation === 'landscape' || reportType === 'delivery_sheet');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — ${escapeHtml(shopName)}</title>
  <style>
    @page {
      size: A4 ${isLandscape ? 'landscape' : 'portrait'};
      margin: 10mm 8mm 12mm 8mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      color: #0f172a;
      background: #ffffff;
      padding: 10px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #7c3aed;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .shop-info h1 {
      font-size: 20px;
      font-weight: 900;
      color: #5b21b6;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
    }

    .shop-info p {
      font-size: 10.5px;
      color: #64748b;
      margin-top: 1px;
    }

    .report-meta {
      text-align: right;
    }

    .report-meta h2 {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .meta-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      color: #6d28d9;
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
    }

    .meta-time {
      font-size: 10px;
      color: #64748b;
    }

    /* Filters banner */
    .filters-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 10.5px;
      color: #334155;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Table styling */
    table.report-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }

    table.report-table thead tr {
      background: #6b21a8;
      color: #ffffff;
    }

    table.report-table th {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 7px 8px;
      border: 1px solid #581c87;
      text-align: left;
    }

    table.report-table td {
      font-size: 10px;
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      line-height: 1.35;
    }

    table.report-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .align-right { text-align: right; }
    .align-center { text-align: center; }
    .align-left { text-align: left; }

    .money-cell {
      font-weight: 700;
      font-family: monospace;
      font-size: 10.5px;
    }

    .badge-status {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .badge-open { background: #dbeafe; color: #1e40af; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-closed { background: #dcfce7; color: #166534; }
    .badge-overdue { background: #fee2e2; color: #991b1b; }
    .badge-ready { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }

    /* Totals Footer Row */
    table.report-table tfoot tr {
      background: #f1f5f9;
      font-weight: 800;
      border-top: 2px solid #0f172a;
      border-bottom: 2px double #0f172a;
    }

    table.report-table tfoot td {
      padding: 8px;
      font-size: 11px;
    }

    /* Report Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-top: 14px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }

    .summary-card .label {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .summary-card .val {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
    }

    /* Signatures */
    .footer-signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 36px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
      page-break-inside: avoid;
    }

    .sig-line {
      width: 180px;
      text-align: center;
      font-size: 10px;
      color: #64748b;
      border-top: 1px solid #94a3b8;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="report-header">
    <div class="shop-info">
      <h1>${escapeHtml(shopName)}</h1>
      <p><strong>${escapeHtml(tagline)}</strong></p>
      <p>${escapeHtml(address)} • Phone: ${escapeHtml(phone)}</p>
    </div>
    <div class="report-meta">
      <h2>${escapeHtml(title)}</h2>
      ${subtitle ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">${escapeHtml(subtitle)}</div>` : ''}
      <div class="meta-tag">Official Business Report</div>
      <div class="meta-time">Generated: ${dateFormatted} at ${timeFormatted} • By: ${escapeHtml(generatedBy)}</div>
    </div>
  </div>

  <!-- Filters summary -->
  ${filtersSummary ? `
    <div class="filters-bar">
      <span><strong>Applied Filters:</strong> ${escapeHtml(filtersSummary)}</span>
      <span>Total Records: <strong>${rows.length}</strong></span>
    </div>
  ` : ''}

  <!-- Data Table -->
  <table class="report-table">
    <thead>
      <tr>
        ${columns.map(col => `
          <th class="${col.align === 'right' || col.isMoney ? 'align-right' : col.align === 'center' || col.isNum ? 'align-center' : 'align-left'}">
            ${escapeHtml(col.header)}
          </th>
        `).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.length === 0 ? `
        <tr>
          <td colspan="${columns.length}" style="text-align: center; padding: 24px; color: #94a3b8;">
            Selected filters ke mutabiq koi data mojood nahi hai.
          </td>
        </tr>
      ` : rows.map(r => `
        <tr>
          ${columns.map(col => {
    const val = r[col.key];
    let displayVal = escapeHtml(val ?? '—');
    let alignClass = col.align === 'right' ? 'align-right' : col.align === 'center' ? 'align-center' : 'align-left';

    if (r[col.key + '_html']) {
      displayVal = r[col.key + '_html'];
    } else if (col.isMoney) {
      alignClass = 'align-right money-cell';
      displayVal = formatMoney(val);
    } else if (col.isNum) {
      alignClass = 'align-center';
    } else if (col.key.includes('date') || col.key === 'paid_on' || col.key === 'booked_at') {
      alignClass = 'align-center';
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        displayVal = escapeHtml(formatDateDDMMYYYY(val));
      }
    } else if (col.key === 'dresses_summary' || col.key === 'dresses' || (col.header && col.header.toLowerCase().includes('dress'))) {
      if (typeof val === 'string' && val.trim() && val !== '—') {
        const items = val.split(/[,\n]/)
          .map(s => s.replace(/^[•\s*-]+/, '').trim())
          .filter(Boolean);
        if (items.length > 0) {
          displayVal = `<div style="display:flex;flex-direction:column;gap:3px;text-align:left;">` +
            items.map(it => `
              <div style="display:flex;align-items:flex-start;gap:5px;line-height:1.35;">
                <span style="color:#7c3aed;font-size:10px;line-height:1.2;flex-shrink:0;">•</span>
                <span>${escapeHtml(it)}</span>
              </div>
            `).join('') +
            `</div>`;
        }
      }
    } else if (typeof val === 'string' && val.includes('\n')) {
      displayVal = escapeHtml(val).replace(/\n/g, '<br/>');
    }

    // Special badges
    if (col.key === 'status') {
      const s = String(val).toLowerCase();
      displayVal = `<span class="badge-status badge-${s}">${escapeHtml(val)}</span>`;
    } else if (col.key === 'is_ready_text' && val === 'Ready') {
      displayVal = `<span class="badge-status badge-ready">✓ Ready</span>`;
    } else if (col.key === 'days_late' && Number(val) > 0) {
      displayVal = `<span class="badge-status badge-overdue">⚠️ ${val} din LATE</span>`;
    }

    return `<td class="${alignClass}">${displayVal}</td>`;
  }).join('')}
        </tr>
      `).join('')}
    </tbody>

    ${totals && Object.keys(totals).length > 0 ? `
      <tfoot>
        <tr>
          ${columns.map((col, idx) => {
    if (idx === 0) return `<td>TOTAL / کُل (${rows.length})</td>`;
    if (totals[col.key + '_html']) {
      return `<td class="${col.align === 'right' || col.isMoney ? 'align-right' : 'align-center'}">${totals[col.key + '_html']}</td>`;
    }
    if (totals[col.key] !== undefined && totals[col.key] !== '') {
      const tVal = col.isMoney ? formatMoney(totals[col.key]) : escapeHtml(totals[col.key]).replace(/\n/g, '<br/>');
      return `<td class="${col.isMoney ? 'align-right money-cell' : 'align-center'}">${tVal}</td>`;
    }
    return `<td></td>`;
  }).join('')}
        </tr>
      </tfoot>
    ` : ''}
  </table>

  <!-- Optional Summary Box -->
  ${totals && (totals.grand_total !== undefined || totals.amount_paid !== undefined || totals.remaining !== undefined) ? `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Records</div>
        <div class="val">${rows.length}</div>
      </div>
      ${totals.grand_total !== undefined ? `
        <div class="summary-card">
          <div class="label">Total Amount</div>
          <div class="val" style="color: #0f172a;">${formatMoney(totals.grand_total)}</div>
        </div>
      ` : ''}
      ${totals.amount_paid !== undefined ? `
        <div class="summary-card">
          <div class="label">Total Paid</div>
          <div class="val" style="color: #16a34a;">${formatMoney(totals.amount_paid)}</div>
        </div>
      ` : ''}
      ${totals.remaining !== undefined ? `
        <div class="summary-card">
          <div class="label">Total Remaining</div>
          <div class="val" style="color: #dc2626;">${formatMoney(totals.remaining)}</div>
        </div>
      ` : ''}
    </div>
  ` : ''}

  <!-- Footer Verification & Signatures -->
  <div class="footer-signatures">
    <div class="sig-line">Prepared By (Staff)</div>
    <div class="sig-line">Checked By (Manager)</div>
    <div class="sig-line">Proprietor / Owner Signature</div>
  </div>
</body>
</html>`;
}

module.exports = {
  renderReportHtml,
};
