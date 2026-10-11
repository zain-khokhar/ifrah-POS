/**
 * electron/receipts/service.js
 *
 * Full receipt printing and PDF generation service for Ifrah Collection POS.
 * Interacts with SQLite, Electron window printing APIs, and receipt HTML templates.
 */

const { BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { requireRole, ROLES } = require('../auth/roles');
const { withAudit } = require('../auth/audit');
const { renderReceiptHtml } = require('./template');

function createReceiptsService(db, settingsService, bookingsService) {

  // ─── GET RECEIPT DATA ─────────────────────────────────────────────────────
  async function getReceiptData(session, bookingId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const booking = bookingsService.get(session, bookingId);
    if (!booking) {
      throw new Error(`Booking #${bookingId} not found or was deleted.`);
    }

    const settings = settingsService.getSettings(session);
    const isReprint = (Number(booking.receipt_print_count) || 0) > 0;

    return {
      ok: true,
      booking,
      settings,
      isReprint,
      printCount: booking.receipt_print_count || 0,
    };
  }

  // ─── GET SYSTEM PRINTERS ──────────────────────────────────────────────────
  async function getPrinters(session) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    try {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length > 0) {
        const printers = await allWindows[0].webContents.getPrintersAsync();
        return (printers || []).map(p => ({
          name: p.name,
          displayName: p.displayName || p.name,
          description: p.description || '',
          status: p.status,
          isDefault: Boolean(p.isDefault),
        }));
      }
    } catch (e) {
      console.warn('[Receipts] Could not list system printers:', e.message);
    }
    return [];
  }

  // ─── RECORD PRINT (Reprint Counter & Audit) ───────────────────────────────
  function recordPrint(session, bookingId) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    const row = db.prepare('SELECT booking_no, receipt_print_count FROM bookings WHERE id = ?').get(bookingId);
    const prevCount = row?.receipt_print_count || 0;
    const newCount = prevCount + 1;
    const user = session?.user || session;

    return withAudit(
      db,
      user,
      'RECEIPT_PRINTED',
      'bookings',
      bookingId,
      {
        oldValues: { receipt_print_count: prevCount },
        newValues: { receipt_print_count: newCount, printed_at: new Date().toISOString() },
      },
      () => {
        db.prepare('UPDATE bookings SET receipt_print_count = ? WHERE id = ?').run(newCount, bookingId);
        return { ok: true, print_count: newCount };
      }
    );
  }

  // ─── GENERATE HTML ────────────────────────────────────────────────────────
  async function generateHtml(session, { bookingId, layout = '80mm', isCopy = false }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);

    const data = await getReceiptData(session, bookingId);
    const printedBy = session?.user?.full_name || 'Staff';

    // Auto-detect copy if not explicitly passed
    const copyFlag = (isCopy !== undefined && isCopy !== null) ? Boolean(isCopy) : data.isReprint;

    const html = renderReceiptHtml({
      booking: data.booking,
      settings: data.settings,
      layout,
      isCopy: copyFlag,
      printedBy,
    });

    return {
      ok: true,
      html,
      booking: data.booking,
      settings: data.settings,
      isReprint: data.isReprint,
    };
  }

  // ─── PRINT DIRECT (Electron WebContents Print) ────────────────────────────
  async function printDirect(session, { bookingId, layout = '80mm', printerName = '', copies = 1, silent = false, isCopy = false }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    const { html, booking } = await generateHtml(session, { bookingId, layout, isCopy });

    return new Promise((resolve, reject) => {
      let win = new BrowserWindow({
        show: false,
        width: 800,
        height: 1000,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      win.webContents.once('did-finish-load', () => {
        const printOptions = {
          silent: Boolean(silent || printerName),
          printBackground: true,
          copies: Math.max(1, parseInt(copies || 1, 10)),
          margins: { marginType: 'none' },
        };

        if (printerName) {
          printOptions.deviceName = printerName;
        }

        if (layout === 'a4' || layout === 'A4') {
          printOptions.pageSize = 'A4';
        } else {
          printOptions.pageSize = { width: 80000, height: 300000 };
        }

        win.webContents.print(printOptions, (success, failureReason) => {
          try { win.destroy(); win = null; } catch {}

          if (!success) {
            reject(new Error(failureReason || 'Print canceled or failed.'));
          } else {
            recordPrint(session, bookingId);
            resolve({ ok: true, booking_no: booking.booking_no });
          }
        });
      });

      win.webContents.once('did-fail-load', (_e, code, desc) => {
        try { win.destroy(); win = null; } catch {}
        reject(new Error(`Failed to load receipt HTML: ${desc} (${code})`));
      });
    });
  }

  // ─── SAVE AS PDF (Electron WebContents PrintToPDF) ─────────────────────────
  async function savePdf(session, { bookingId, layout = '80mm', isCopy = false, targetPath = null }) {
    requireRole(session, [ROLES.OWNER, ROLES.CASHIER]);

    const { html, booking } = await generateHtml(session, { bookingId, layout, isCopy });

    return new Promise((resolve, reject) => {
      let win = new BrowserWindow({
        show: false,
        width: 800,
        height: 1000,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      win.webContents.once('did-finish-load', async () => {
        try {
          const pdfOptions = {
            printBackground: true,
            margins: { marginType: 'none' },
          };

          if (layout === 'a4' || layout === 'A4') {
            pdfOptions.pageSize = 'A4';
          } else {
            pdfOptions.pageSize = { width: 80000, height: 300000 };
          }

          const pdfBuffer = await win.webContents.printToPDF(pdfOptions);
          try { win.destroy(); win = null; } catch {}

          let finalPath = targetPath;
          if (!finalPath) {
            const defaultFilename = `Receipt-Booking-${booking.booking_no}.pdf`;
            const saveRes = await dialog.showSaveDialog({
              title: `Save Receipt #${booking.booking_no} as PDF`,
              defaultPath: defaultFilename,
              filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
            });

            if (saveRes.canceled || !saveRes.filePath) {
              return resolve({ ok: false, canceled: true });
            }
            finalPath = saveRes.filePath;
          }

          await fs.promises.writeFile(finalPath, pdfBuffer);
          recordPrint(session, bookingId);

          resolve({
            ok: true,
            filePath: finalPath,
            booking_no: booking.booking_no,
          });
        } catch (err) {
          try { if (win) win.destroy(); } catch {}
          reject(err);
        }
      });

      win.webContents.once('did-fail-load', (_e, code, desc) => {
        try { win.destroy(); win = null; } catch {}
        reject(new Error(`Failed to load receipt HTML for PDF: ${desc} (${code})`));
      });
    });
  }

  return {
    getReceiptData,
    getPrinters,
    recordPrint,
    generateHtml,
    printDirect,
    savePdf,
  };
}

module.exports = { createReceiptsService };
