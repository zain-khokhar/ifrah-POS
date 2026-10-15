/**
 * electron/reports/excel.js
 *
 * Phase 10 — Excel Export Engine using ExcelJS.
 *
 * Key features:
 *  - Real numbers for amounts and counts (proper Excel numeric types).
 *  - Real dates (YYYY-MM-DD).
 *  - Phone numbers and CNIC stored strictly as text with leading zeros intact.
 *  - Full UTF-8 Urdu and English character support.
 *  - Frozen header row.
 *  - Beautiful styling: #6B21A8 header, white bold text, thin borders.
 *  - Dedicated totals row at bottom with top thin and bottom double border.
 *  - Multi-tab 'Export Everything' workbook for emergency offline backup.
 */

let ExcelJS = null;
function getExcelJS() {
  if (!ExcelJS) {
    ExcelJS = require('exceljs');
  }
  return ExcelJS;
}


const BRAND_PURPLE = '6B21A8';
const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: BRAND_PURPLE },
};
const HEADER_FONT = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};
const ROW_FONT = {
  name: 'Segoe UI',
  size: 10,
};
const TOTAL_FONT = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: '0F172A' },
};
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'E2E8F0' } },
  left: { style: 'thin', color: { argb: 'E2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
  right: { style: 'thin', color: { argb: 'E2E8F0' } },
};
const TOTAL_BORDER = {
  top: { style: 'thin', color: { argb: '0F172A' } },
  bottom: { style: 'double', color: { argb: '0F172A' } },
};

/**
 * Build a styled Excel workbook for a single report.
 *
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.subtitle
 * @param {Array<{ key: string, header: string, width?: number, isNum?: boolean, isText?: boolean, isMoney?: boolean }>} params.columns
 * @param {Array<object>} params.rows
 * @param {object} [params.totals] - optional totals row object { colKey: totalValue }
 * @returns {Promise<Buffer>}
 */
async function buildExcelReport({ title, subtitle = '', columns, rows, totals = null }) {
  const Excel = getExcelJS();
  const workbook = new Excel.Workbook();
  workbook.creator = 'Ifrah Collection POS';
  workbook.lastModifiedBy = 'Ifrah Collection POS';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheetName = (title || 'Report').slice(0, 31).replace(/[\\/?*[\]]/g, '');
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // 1. Setup columns
  sheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width || Math.max(14, col.header.length + 4),
  }));

  // Style Header Row
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // 2. Add Data Rows
  rows.forEach((rowData) => {
    const rowValues = {};
    columns.forEach(col => {
      let val = rowData[col.key];
      if (val === undefined || val === null) {
        val = '';
      }

      // Preserve phone & CNIC leading zeros strictly as text
      if (col.isText || col.key.includes('phone') || col.key.includes('cnic')) {
        rowValues[col.key] = String(val);
      } else if (col.isMoney || col.isNum) {
        const num = Number(val);
        rowValues[col.key] = isNaN(num) ? 0 : num;
      } else {
        rowValues[col.key] = val;
      }
    });

    const addedRow = sheet.addRow(rowValues);
    let maxLines = 1;
    columns.forEach(col => {
      const val = rowValues[col.key];
      if (typeof val === 'string') {
        const lines = val.split('\n').length;
        if (lines > maxLines) maxLines = lines;
      }
    });
    addedRow.height = Math.max(22, Math.min(120, maxLines * 18));

    addedRow.eachCell((cell, colNumber) => {
      cell.font = ROW_FONT;
      cell.border = THIN_BORDER;
      const colDef = columns[colNumber - 1];

      if (colDef?.isMoney) {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'top', horizontal: 'right', wrapText: true };
      } else if (colDef?.isNum) {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
      } else if (colDef?.isText || colDef?.key.includes('phone') || colDef?.key.includes('cnic') || colDef?.key.includes('date') || colDef?.key === 'booked_at' || colDef?.key === 'paid_on') {
        cell.numFmt = '@'; // Force text format
        cell.alignment = {
          vertical: 'top',
          horizontal: colDef?.align === 'right' ? 'right' : colDef?.align === 'center' ? 'center' : (colDef?.key.includes('date') || colDef?.key === 'booked_at' || colDef?.key === 'paid_on') ? 'center' : 'left',
          wrapText: true,
        };
      } else {
        cell.alignment = {
          vertical: 'top',
          horizontal: colDef?.align === 'right' ? 'right' : colDef?.align === 'center' ? 'center' : 'left',
          wrapText: true,
        };
      }
    });
  });

  // 3. Optional Totals Row at the bottom
  if (totals && Object.keys(totals).length > 0) {
    const totalsRowValues = {};
    columns.forEach((col, idx) => {
      if (idx === 0) {
        totalsRowValues[col.key] = 'TOTAL / کُل';
      } else if (totals[col.key] !== undefined) {
        const num = Number(totals[col.key]);
        totalsRowValues[col.key] = isNaN(num) ? totals[col.key] : num;
      } else {
        totalsRowValues[col.key] = '';
      }
    });

    const addedTotalsRow = sheet.addRow(totalsRowValues);
    let maxTotLines = 1;
    columns.forEach(col => {
      const val = totalsRowValues[col.key];
      if (typeof val === 'string') {
        const lines = val.split('\n').length;
        if (lines > maxTotLines) maxTotLines = lines;
      }
    });
    addedTotalsRow.height = Math.max(26, Math.min(80, maxTotLines * 18));

    addedTotalsRow.eachCell((cell, colNumber) => {
      cell.font = TOTAL_FONT;
      cell.border = TOTAL_BORDER;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F8FAFC' },
      };
      const colDef = columns[colNumber - 1];
      if (colDef?.isMoney) {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'top', horizontal: 'right', wrapText: true };
      } else if (colNumber === 1) {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = {
          vertical: 'top',
          horizontal: colDef?.align === 'right' ? 'right' : colDef?.align === 'center' ? 'center' : 'left',
          wrapText: true,
        };
      }
    });
  }

  // Generate buffer
  return await workbook.xlsx.writeBuffer();
}

/**
 * Build Full System Excel Workbook (5 Tabs).
 * Used for emergency fallback and full backup in Settings & Reports.
 *
 * Tabs:
 *  1. Bookings
 *  2. Booking Items
 *  3. Payments
 *  4. Customers
 *  5. Dresses
 *
 * @param {object} systemData - { bookings, items, payments, customers, dresses }
 * @returns {Promise<Buffer>}
 */
async function buildFullSystemExcel(systemData) {
  const Excel = getExcelJS();
  const workbook = new Excel.Workbook();
  workbook.creator = 'Ifrah Collection POS';
  workbook.lastModifiedBy = 'Ifrah Collection POS';
  workbook.created = new Date();

  function addStyledSheet(sheetName, columns, rows) {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || Math.max(14, col.header.length + 4),
    }));

    const hRow = sheet.getRow(1);
    hRow.height = 28;
    hRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    rows.forEach(r => {
      const rowValues = {};
      columns.forEach(col => {
        let val = r[col.key];
        if (val === undefined || val === null) val = '';
        if (col.isText || col.key.includes('phone') || col.key.includes('cnic')) {
          rowValues[col.key] = String(val);
        } else if (col.isMoney || col.isNum) {
          const n = Number(val);
          rowValues[col.key] = isNaN(n) ? 0 : n;
        } else {
          rowValues[col.key] = val;
        }
      });

      const row = sheet.addRow(rowValues);
      row.height = 20;
      row.eachCell((cell, colNum) => {
        cell.font = ROW_FONT;
        cell.border = THIN_BORDER;
        const colDef = columns[colNum - 1];
        if (colDef?.isMoney) {
          cell.numFmt = '#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colDef?.isText || colDef?.key.includes('phone') || colDef?.key.includes('cnic')) {
          cell.numFmt = '@';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    });
  }

  // 1. Bookings Tab
  addStyledSheet(
    'Bookings',
    [
      { header: 'Booking #', key: 'booking_no', isNum: true, width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Customer', key: 'customer_name', width: 22 },
      { header: 'Phone', key: 'customer_phone', isText: true, width: 16 },
      { header: 'CNIC', key: 'customer_cnic', isText: true, width: 18 },
      { header: 'City', key: 'city', width: 14 },
      { header: 'Booking Date', key: 'booking_date', width: 14 },
      { header: 'Delivery Date', key: 'delivery_date', width: 14 },
      { header: 'Return Date', key: 'returning_date', width: 14 },
      { header: 'Delivered On', key: 'delivered_on', width: 14 },
      { header: 'Returned On', key: 'returned_on', width: 14 },
      { header: 'Condition', key: 'return_condition', width: 14 },
      { header: 'Grand Total', key: 'grand_total', isMoney: true, width: 16 },
      { header: 'Paid', key: 'amount_paid', isMoney: true, width: 16 },
      { header: 'Remaining', key: 'remaining', isMoney: true, width: 16 },
      { header: 'Security Deposit', key: 'security_deposit', isMoney: true, width: 16 },
      { header: 'Dresses Summary', key: 'dresses_summary', width: 30 },
      { header: 'Notes', key: 'notes', width: 24 },
    ],
    systemData.bookings || []
  );

  // 2. Booking Items Tab
  addStyledSheet(
    'Booking Items',
    [
      { header: 'Booking #', key: 'booking_no', isNum: true, width: 14 },
      { header: 'Line #', key: 'line_no', isNum: true, width: 10 },
      { header: 'Dress Name', key: 'dress_name_snapshot', width: 26 },
      { header: 'Size', key: 'size', width: 10 },
      { header: 'Quantity', key: 'quantity', isNum: true, width: 10 },
      { header: 'Rate', key: 'rate', isMoney: true, width: 14 },
      { header: 'Line Total', key: 'line_total', isMoney: true, width: 14 },
      { header: 'Jewellery', key: 'jewellery', width: 12 },
      { header: 'Clutch / Purse', key: 'clutch_purse', width: 14 },
      { header: 'Ready', key: 'is_ready_text', width: 10 },
      { header: 'Item Condition', key: 'item_condition', width: 14 },
    ],
    (systemData.items || []).map(it => ({
      ...it,
      jewellery: it.jewellery ? 'Yes' : 'No',
      clutch_purse: it.clutch_purse ? 'Yes' : 'No',
      is_ready_text: it.is_ready ? 'Ready' : 'Pending',
    }))
  );

  // 3. Payments Tab
  addStyledSheet(
    'Payments',
    [
      { header: 'Payment ID', key: 'id', isNum: true, width: 12 },
      { header: 'Booking #', key: 'booking_no', isNum: true, width: 14 },
      { header: 'Amount', key: 'amount', isMoney: true, width: 16 },
      { header: 'Method', key: 'payment_method', width: 14 },
      { header: 'Kind', key: 'kind', width: 16 },
      { header: 'Paid Date', key: 'paid_on', width: 14 },
      { header: 'Is Void', key: 'is_void_text', width: 10 },
      { header: 'Void Reason', key: 'void_reason', width: 24 },
      { header: 'Notes', key: 'note', width: 24 },
    ],
    (systemData.payments || []).map(p => ({
      ...p,
      is_void_text: p.is_void ? 'VOID' : 'Valid',
    }))
  );

  // 4. Customers Tab
  addStyledSheet(
    'Customers',
    [
      { header: 'Customer ID', key: 'id', isNum: true, width: 12 },
      { header: 'Customer Name', key: 'name', width: 24 },
      { header: 'Phone 1', key: 'phone', isText: true, width: 16 },
      { header: 'Phone 2', key: 'phone2', isText: true, width: 16 },
      { header: 'CNIC', key: 'cnic', isText: true, width: 18 },
      { header: 'City', key: 'city', width: 16 },
      { header: 'Cast', key: 'cast', width: 16 },
      { header: 'Relative Name', key: 'relative_name', width: 20 },
      { header: 'Relation', key: 'relation_type', width: 16 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Total Bookings', key: 'booking_count', isNum: true, width: 14 },
    ],
    systemData.customers || []
  );

  // 5. Dresses Tab
  addStyledSheet(
    'Dresses',
    [
      { header: 'Dress ID', key: 'id', isNum: true, width: 12 },
      { header: 'Code', key: 'code', isText: true, width: 12 },
      { header: 'Dress Name', key: 'name', width: 26 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Color', key: 'color', width: 14 },
      { header: 'Default Rate', key: 'default_rate', isMoney: true, width: 16 },
      { header: 'Active', key: 'is_active_text', width: 10 },
      { header: 'Total Times Booked', key: 'times_booked', isNum: true, width: 18 },
    ],
    (systemData.dresses || []).map(d => ({
      ...d,
      is_active_text: d.is_active ? 'Yes' : 'No',
    }))
  );

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  buildExcelReport,
  buildFullSystemExcel,
};
