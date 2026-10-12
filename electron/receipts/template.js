/**
 * electron/receipts/template.js
 *
 * Professional receipt HTML/CSS template generator for Ifrah Collection.
 * Supports:
 *  - 80mm Thermal POS roll layout (compact, high-contrast, dotted dividers)
 *  - A4 Full Page Invoice layout (elegant boutique presentation, signatures)
 *  - Full bilingual Urdu & English support
 *  - Offline safe fonts & sensible page breaks
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateDisplay(dStr) {
  if (!dStr) return '-';
  const parts = String(dStr).split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dStr;
}

function renderReceiptHtml({ booking, settings = {}, layout = '80mm', isCopy = false, printedBy = 'Staff' }) {
  const shopName = settings.shop_name || 'IFRAH COLLECTION';
  const shopTagline = settings.shop_tagline || 'Exclusive Bridal & Party Wear';
  const shopAddress = settings.shop_address || 'Main Bazaar';
  const shopPhone = settings.shop_phone || '0300-1234567';
  const shopPhone2 = settings.shop_phone2 || '';
  const shopCity = settings.shop_city || 'Lahore';
  const footerUr = settings.receipt_footer_ur || 'واپسی پر ڈریس صاف اور درست حالت میں واپس کرنا لازمی ہے۔ تاخیر کی صورت میں یومیہ کرایہ وصول ہوگا۔';
  const footerEn = settings.receipt_footer_en || 'Dress must be returned in good condition. Late return will incur daily rental charges.';

  const isA4 = layout === 'a4' || layout === 'A4';
  const isThermal = !isA4;

  const now = new Date();
  const printTimestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const items = booking.items || [];
  const payments = (booking.payments || []).filter(p => !p.is_void);

  const subtotal = items.reduce((sum, it) => sum + (Number(it.line_total) || (Number(it.quantity || 1) * Number(it.rate || 0))), 0);
  const discount = Number(booking.discount || 0);
  const grandTotal = Number(booking.grand_total || (subtotal - discount));
  const totalPaid = payments.reduce((sum, p) => p.kind === 'rental' ? sum + Number(p.amount || 0) : sum, 0);
  const remaining = Math.max(0, grandTotal - totalPaid);
  const securityDeposit = Number(booking.security_deposit || 0);

  // Accessories helper
  function renderAccessories(it) {
    const accs = [];
    if (it.jewellery) accs.push('Jewellery (جیولری)');
    if (it.clutch_purse) accs.push('Clutch (پرس)');
    if (it.hand_bag) accs.push('Hand Bag (ہینڈ بیگ)');
    if (it.double_dupatta) accs.push('2x Dupatta (ڈبل دوپٹہ)');
    if (it.shoes) accs.push('Shoes (جوتے)');
    if (accs.length === 0) return '';
    return `<div class="item-accessories"><strong>Acc:</strong> ${accs.map(a => `<span class="acc-badge">${escapeHtml(a)}</span>`).join(' ')}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt #${escapeHtml(booking.booking_no)} - ${escapeHtml(shopName)}</title>
  <style>
    /* ── RESET & BASE FONTS ── */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Nastaliq Urdu", "Urdu Typesetting", "Jameel Noori Nastaleeq", Tahoma, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      line-height: 1.35;
      -webkit-font-smoothing: antialiased;
    }

    .urdu-text {
      direction: rtl;
      font-family: "Noto Nastaliq Urdu", "Urdu Typesetting", "Jameel Noori Nastaleeq", "Segoe UI", Tahoma, Arial, sans-serif;
      line-height: 1.8;
      text-align: right;
    }

    /* ── PAGE LAYOUTS ── */
    ${isThermal ? `
    @page {
      size: 80mm auto;
      margin: 3mm;
    }
    .receipt-container {
      width: 74mm;
      max-width: 74mm;
      margin: 0 auto;
      padding: 4px;
      font-size: 11px;
    }
    .thermal-divider {
      border-top: 1px dashed #374151;
      margin: 6px 0;
    }
    .thermal-divider-double {
      border-top: 2px solid #111827;
      margin: 8px 0;
    }
    .shop-title {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      text-align: center;
      line-height: 1.1;
    }
    .shop-sub {
      font-size: 10px;
      text-align: center;
      color: #4b5563;
      margin-top: 2px;
    }
    .shop-contact {
      font-size: 10px;
      text-align: center;
      color: #374151;
      margin-top: 3px;
    }
    .copy-stamp {
      border: 1.5px solid #111827;
      border-radius: 4px;
      font-weight: 800;
      font-size: 11px;
      text-align: center;
      padding: 3px;
      margin: 6px 0;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .booking-headline {
      text-align: center;
      font-size: 14px;
      font-weight: 900;
      padding: 3px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      padding: 1.5px 0;
    }
    .meta-label {
      color: #4b5563;
      font-weight: 600;
    }
    .meta-val {
      font-weight: 700;
      text-align: right;
    }
    .dates-box {
      background: #f3f4f6;
      border-radius: 4px;
      padding: 5px 6px;
      margin: 5px 0;
      border: 1px solid #e5e7eb;
    }
    .customer-box {
      margin: 5px 0;
      padding: 4px 0;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 10.5px;
    }
    .items-table th {
      border-bottom: 1.5px solid #111827;
      text-align: left;
      padding: 3px 2px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 4px 2px;
      vertical-align: top;
      border-bottom: 1px dotted #e5e7eb;
      page-break-inside: avoid;
    }
    .item-name {
      font-weight: 700;
      font-size: 11px;
    }
    .item-meta {
      font-size: 9.5px;
      color: #4b5563;
    }
    .acc-badge {
      display: inline-block;
      background: #e5e7eb;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 9px;
      margin-top: 2px;
    }
    .totals-area {
      margin: 6px 0;
      font-size: 11px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
    .grand-total-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 900;
      padding: 4px 0;
      border-top: 1px solid #111827;
      border-bottom: 1px solid #111827;
      margin: 3px 0;
    }
    .remaining-card {
      border: 2px solid #111827;
      border-radius: 4px;
      padding: 6px;
      text-align: center;
      margin: 6px 0;
      background: #fafafa;
    }
    .remaining-card .rem-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .remaining-card .rem-val {
      font-size: 17px;
      font-weight: 900;
      margin-top: 1px;
    }
    .footer-terms {
      font-size: 9px;
      text-align: center;
      color: #374151;
      margin-top: 8px;
      padding-top: 4px;
      border-top: 1px dotted #9ca3af;
    }
    ` : `
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    .receipt-container {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
      padding: 10px 14px;
      font-size: 13px;
    }
    .header-table {
      width: 100%;
      border-bottom: 2.5px solid #7c3aed;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .shop-title {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 1px;
      color: #4c1d95;
      text-transform: uppercase;
    }
    .shop-sub {
      font-size: 12px;
      color: #6d28d9;
      font-weight: 600;
      margin-top: 2px;
    }
    .shop-contact {
      font-size: 11.5px;
      color: #4b5563;
      margin-top: 4px;
      line-height: 1.4;
    }
    .invoice-badge-block {
      text-align: right;
    }
    .invoice-title {
      font-size: 22px;
      font-weight: 900;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .invoice-no {
      font-family: monospace;
      font-size: 18px;
      font-weight: 900;
      color: #7c3aed;
    }
    .copy-stamp {
      display: inline-block;
      background: #fef2f2;
      border: 1.5px solid #ef4444;
      color: #b91c1c;
      font-weight: 800;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 4px;
      letter-spacing: 0.5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .info-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .info-card-title {
      font-size: 11px;
      font-weight: 800;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 2.5px 0;
      font-size: 12px;
    }
    .meta-label {
      color: #4b5563;
      font-weight: 500;
    }
    .meta-val {
      font-weight: 700;
      color: #111827;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 12px;
    }
    .items-table th {
      background: #f3f4f6;
      border-top: 1.5px solid #7c3aed;
      border-bottom: 1.5px solid #7c3aed;
      padding: 8px 6px;
      text-align: left;
      font-weight: 800;
      font-size: 11px;
      color: #374151;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 8px 6px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
      page-break-inside: avoid;
    }
    .items-table tr:last-child td {
      border-bottom: 1.5px solid #7c3aed;
    }
    .item-name {
      font-weight: 700;
      font-size: 12.5px;
      color: #111827;
    }
    .item-meta {
      font-size: 11px;
      color: #6b7280;
      margin-top: 1px;
    }
    .acc-badge {
      display: inline-block;
      background: #ede9fe;
      color: #6d28d9;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: 4px;
      margin-top: 3px;
    }
    .bottom-layout {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 20px;
      margin-top: 10px;
      page-break-inside: avoid;
    }
    .payments-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin-top: 6px;
    }
    .payments-table th {
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      padding: 5px 6px;
      text-align: left;
      font-size: 10.5px;
      font-weight: 700;
      color: #6b7280;
    }
    .payments-table td {
      padding: 5px 6px;
      border-bottom: 1px solid #f3f4f6;
    }
    .totals-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 12.5px;
    }
    .grand-total-row {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
      font-weight: 900;
      padding: 8px 0;
      border-top: 1.5px solid #111827;
      border-bottom: 1.5px solid #111827;
      margin: 6px 0;
    }
    .remaining-card {
      border: 2px solid #7c3aed;
      background: #f5f3ff;
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }
    .remaining-card .rem-label {
      font-size: 12px;
      font-weight: 800;
      color: #5b21b6;
      text-transform: uppercase;
    }
    .remaining-card .rem-val {
      font-size: 20px;
      font-weight: 900;
      color: #6d28d9;
    }
    .footer-terms {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      font-size: 10.5px;
      color: #475569;
      page-break-inside: avoid;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 36px;
      padding-top: 10px;
    }
    .sig-line {
      width: 180px;
      border-top: 1px solid #94a3b8;
      text-align: center;
      padding-top: 4px;
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    `}

    @media print {
      body {
        background: #ffffff;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>

<div class="receipt-container">

${isThermal ? `
  <!-- ═══════════ 80MM THERMAL LAYOUT ═══════════ -->
  <div class="shop-title">${escapeHtml(shopName)}</div>
  <div class="shop-sub">${escapeHtml(shopTagline)}</div>
  <div class="shop-contact">
    ${escapeHtml(shopAddress)}<br>
    Tel: ${escapeHtml(shopPhone)}${shopPhone2 ? ` / ${escapeHtml(shopPhone2)}` : ''} • ${escapeHtml(shopCity)}
  </div>

  ${isCopy ? `<div class="copy-stamp">*** DUPLICATE COPY / نقل ***</div>` : ''}

  <div class="thermal-divider-double"></div>

  <div class="booking-headline">BOOKING #${escapeHtml(booking.booking_no)}</div>

  <div class="meta-row">
    <span class="meta-label">Booking Date:</span>
    <span class="meta-val">${formatDateDisplay(booking.booking_date)}</span>
  </div>
  <div class="meta-row">
    <span class="meta-label">Status:</span>
    <span class="meta-val">${escapeHtml(booking.status || 'Open')}</span>
  </div>

  <div class="dates-box">
    <div class="meta-row">
      <span class="meta-label">Delivery (تاریخ روانگی):</span>
      <span class="meta-val" style="font-size: 11px;">${formatDateDisplay(booking.delivery_date)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Return (تاریخ واپسی):</span>
      <span class="meta-val" style="font-size: 11px;">${formatDateDisplay(booking.returning_date)}</span>
    </div>
    ${booking.total_returning_days ? `
    <div class="meta-row">
      <span class="meta-label">Duration:</span>
      <span class="meta-val">${escapeHtml(booking.total_returning_days)} Days (دن)</span>
    </div>` : ''}
  </div>

  <div class="customer-box">
    <div class="meta-row">
      <span class="meta-label">Customer:</span>
      <span class="meta-val">${escapeHtml(booking.customer_name || 'Walk-in')}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Phone:</span>
      <span class="meta-val">${escapeHtml(booking.customer_phone || '-')}</span>
    </div>
    ${booking.customer_cnic ? `
    <div class="meta-row">
      <span class="meta-label">CNIC:</span>
      <span class="meta-val">${escapeHtml(booking.customer_cnic)}</span>
    </div>` : ''}
    ${booking.city || booking.cast ? `
    <div class="meta-row">
      <span class="meta-label">City:</span>
      <span class="meta-val">${escapeHtml([booking.city].filter(Boolean).join(' • '))}</span>
    </div>` : ''}
  
  </div>

  <div class="thermal-divider"></div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 50%;">Dress / Details</th>
        <th style="width: 15%; text-align: center;">Size</th>
        <th style="width: 12%; text-align: center;">Qty</th>
        <th style="width: 23%; text-align: right;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it, idx) => `
        <tr>
          <td>
            <div class="item-name">${escapeHtml(it.dress_name_snapshot || 'Dress')}</div>
            ${it.category ? `<div class="item-meta">${escapeHtml(it.category)}</div>` : ''}
            ${it.description ? `<div class="item-meta urdu-text">${escapeHtml(it.description)}</div>` : ''}
            ${renderAccessories(it)}
          </td>
          <td style="text-align: center; vertical-align: top;">${escapeHtml(it.size || '-')}</td>
          <td style="text-align: center; vertical-align: top;">${escapeHtml(it.quantity || 1)}</td>
          <td style="text-align: right; font-weight: 700; vertical-align: top;">Rs. ${Number(it.line_total || (it.quantity * it.rate)).toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="thermal-divider"></div>

  <!-- Totals -->
  <div class="totals-area">
    <div class="total-row">
      <span>Subtotal (${items.length} items):</span>
      <span>Rs. ${subtotal.toLocaleString()}</span>
    </div>
    ${discount > 0 ? `
    <div class="total-row">
      <span>Discount (رعایت):</span>
      <span>- Rs. ${discount.toLocaleString()}</span>
    </div>` : ''}
    <div class="grand-total-row">
      <span>GRAND TOTAL:</span>
      <span>Rs. ${grandTotal.toLocaleString()}</span>
    </div>

    ${payments.length > 0 ? `
    <div style="margin: 4px 0 2px; font-weight: 700; font-size: 10px; color: #4b5563;">PAYMENTS RECEIVED:</div>
    ${payments.map(p => `
      <div class="total-row" style="font-size: 10px; color: #374151;">
        <span>• ${formatDateDisplay(p.paid_on)} (${escapeHtml(p.payment_method)})</span>
        <span>Rs. ${Number(p.amount).toLocaleString()}</span>
      </div>
    `).join('')}
    ` : ''}

    <div class="total-row" style="font-weight: 700; border-top: 1px dotted #9ca3af; padding-top: 3px; margin-top: 2px;">
      <span>Total Paid (وصول شدہ):</span>
      <span>Rs. ${totalPaid.toLocaleString()}</span>
    </div>

    ${securityDeposit > 0 ? `
    <div class="total-row" style="color: #6b7280; font-size: 10px;">
      <span>Security Deposit (امانت):</span>
      <span>Rs. ${securityDeposit.toLocaleString()}</span>
    </div>` : ''}
  </div>

  <div class="remaining-card">
    <div class="rem-label">REMAINING BALANCE (بقایا رقم)</div>
    <div class="rem-val" style="color: ${remaining > 0 ? '#111827' : '#059669'};">
      ${remaining > 0 ? `Rs. ${remaining.toLocaleString()}` : 'FULLY PAID ✓ (مکمل ادا شدہ)'}
    </div>
  </div>

  ${booking.notes ? `
  <div style="margin: 6px 0; padding: 4px; background: #f9fafb; border-radius: 3px; font-size: 10px;">
    <strong>Special Notes:</strong>
    <div class="urdu-text" style="font-size: 10.5px; margin-top: 2px;">${escapeHtml(booking.notes)}</div>
  </div>` : ''}

  <div class="footer-terms">
    <div class="urdu-text" style="margin-bottom: 4px;">${escapeHtml(footerUr)}</div>
    <div>${escapeHtml(footerEn)}</div>
    <div style="margin-top: 6px; font-size: 8.5px; color: #6b7280;">
      Printed: ${escapeHtml(printTimestamp)} • By: ${escapeHtml(printedBy)}
    </div>
  </div>
` : `
  <!-- ═══════════ A4 FULL PAGE INVOICE LAYOUT ═══════════ -->
  <table class="header-table">
    <tr>
      <td style="vertical-align: top; width: 60%;">
        <div class="shop-title">${escapeHtml(shopName)}</div>
        <div class="shop-sub">${escapeHtml(shopTagline)}</div>
        <div class="shop-contact">
          ${escapeHtml(shopAddress)}, ${escapeHtml(shopCity)}<br>
          Phone: <strong>${escapeHtml(shopPhone)}</strong>${shopPhone2 ? ` • <strong>${escapeHtml(shopPhone2)}</strong>` : ''}
        </div>
      </td>
      <td style="vertical-align: top; text-align: right; width: 40%;">
        <div class="invoice-title">RENTAL INVOICE</div>
        <div class="invoice-no">#${escapeHtml(booking.booking_no)}</div>
        <div style="font-size: 11.5px; color: #6b7280; margin-top: 3px;">
          Booking Date: <strong>${formatDateDisplay(booking.booking_date)}</strong>
        </div>
        <div style="font-size: 11.5px; color: #6b7280;">
          Status: <strong>${escapeHtml(booking.status || 'Open')}</strong>
        </div>
        ${isCopy ? `<div><span class="copy-stamp">DUPLICATE COPY / نقل</span></div>` : ''}
      </td>
    </tr>
  </table>

  <!-- Customer & Event Grid -->
  <div class="info-grid">
    <div class="info-card">
      <div class="info-card-title">Customer Details (گاہک کی تفصیلات)</div>
      <div class="meta-row">
        <span class="meta-label">Customer Name:</span>
        <span class="meta-val">${escapeHtml(booking.customer_name || 'Walk-in Customer')}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Phone Number:</span>
        <span class="meta-val">${escapeHtml(booking.customer_phone || '-')}</span>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Rental Period & Dates (تاریخ و دورانیہ)</div>
      <div class="meta-row">
        <span class="meta-label">Delivery Date (روانگی):</span>
        <span class="meta-val" style="font-size: 13px; color: #7c3aed;">${formatDateDisplay(booking.delivery_date)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Returning Date (واپسی):</span>
        <span class="meta-val" style="font-size: 13px; color: #dc2626;">${formatDateDisplay(booking.returning_date)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Total Rental Days:</span>
        <span class="meta-val">${escapeHtml(booking.total_returning_days || 1)} Days</span>
      </div>
      ${booking.notes ? `
      <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dotted #e5e7eb;">
        <span class="meta-label">Notes:</span>
        <div class="urdu-text" style="font-size: 12px; margin-top: 2px;">${escapeHtml(booking.notes)}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 45%;">Dress Description / Accessories</th>
        <th style="width: 12%; text-align: center;">Size</th>
        <th style="width: 10%; text-align: center;">Qty</th>
        <th style="width: 13%; text-align: right;">Rate (Rs.)</th>
        <th style="width: 15%; text-align: right;">Total (Rs.)</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it, idx) => `
        <tr>
          <td style="color: #6b7280; font-weight: 700;">${idx + 1}</td>
          <td>
            <div class="item-name">${escapeHtml(it.dress_name_snapshot || 'Dress')}</div>
            ${it.category ? `<div class="item-meta">${escapeHtml(it.category)}</div>` : ''}
            ${it.description ? `<div class="item-meta urdu-text">${escapeHtml(it.description)}</div>` : ''}
            ${renderAccessories(it)}
          </td>
          <td style="text-align: center; vertical-align: top;">${escapeHtml(it.size || '-')}</td>
          <td style="text-align: center; vertical-align: top;">${escapeHtml(it.quantity || 1)}</td>
          <td style="text-align: right; vertical-align: top;">${Number(it.rate || 0).toLocaleString()}</td>
          <td style="text-align: right; font-weight: 800; vertical-align: top;">${Number(it.line_total || (it.quantity * it.rate)).toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Bottom Layout: Payments & Totals -->
  <div class="bottom-layout">
    <div>
      <div style="font-size: 12px; font-weight: 800; color: #374151; margin-bottom: 4px; text-transform: uppercase;">
        Payment History (وصولیاں)
      </div>
      <table class="payments-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Method</th>
            <th>Type</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${payments.length > 0 ? payments.map(p => `
            <tr>
              <td>${formatDateDisplay(p.paid_on)}</td>
              <td style="text-transform: capitalize;">${escapeHtml(p.payment_method)}</td>
              <td style="text-transform: capitalize; color: #6b7280;">${escapeHtml(p.kind)}</td>
              <td style="text-align: right; font-weight: 700;">Rs. ${Number(p.amount).toLocaleString()}</td>
            </tr>
          `).join('') : `
            <tr><td colspan="4" style="color: #94a3b8; text-align: center; padding: 10px;">No payments recorded yet</td></tr>
          `}
        </tbody>
      </table>
    </div>

    <div class="totals-card">
      <div class="total-row">
        <span>Items Subtotal:</span>
        <span style="font-weight: 700;">Rs. ${subtotal.toLocaleString()}</span>
      </div>
      ${discount > 0 ? `
      <div class="total-row" style="color: #dc2626;">
        <span>Discount:</span>
        <span style="font-weight: 700;">- Rs. ${discount.toLocaleString()}</span>
      </div>` : ''}
      <div class="grand-total-row">
        <span>GRAND TOTAL:</span>
        <span>Rs. ${grandTotal.toLocaleString()}</span>
      </div>
      <div class="total-row">
        <span>Total Paid:</span>
        <span style="font-weight: 700; color: #059669;">Rs. ${totalPaid.toLocaleString()}</span>
      </div>
      ${securityDeposit > 0 ? `
      <div class="total-row" style="color: #4b5563; font-size: 11.5px;">
        <span>Security Deposit (Refundable):</span>
        <span style="font-weight: 700;">Rs. ${securityDeposit.toLocaleString()}</span>
      </div>` : ''}

      <div class="remaining-card">
        <div class="rem-label">Remaining Balance</div>
        <div class="rem-val">
          ${remaining > 0 ? `Rs. ${remaining.toLocaleString()}` : 'Fully Paid ✓'}
        </div>
      </div>
    </div>
  </div>

  <!-- Signatures -->
  <div class="signature-row">
    <div class="sig-line">Customer Signature (دستخط گاہک)</div>
    <div class="sig-line">Authorized Signature (دستخط شاپ)</div>
  </div>

  <!-- Footer Terms -->
  <div class="footer-terms">
    <div class="urdu-text" style="font-size: 12px; margin-bottom: 6px;">
      <strong>شرائط و ضوابط:</strong> ${escapeHtml(footerUr)}
    </div>
    <div style="font-size: 11px;">
      <strong>Terms & Conditions:</strong> ${escapeHtml(footerEn)}
    </div>
    <div style="margin-top: 10px; font-size: 10px; color: #94a3b8; text-align: center;">
      Printed on ${escapeHtml(printTimestamp)} 
    </div>
  </div>
`}

</div>

</body>
</html>`;
}

module.exports = {
  renderReceiptHtml,
  escapeHtml,
  formatDateDisplay,
};
