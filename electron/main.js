const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const { getDb, closeDb }       = require('./database/db');
const { createAuthService }    = require('./auth/service');
const { requireRole, ROLES, AuthorizationError } = require('./auth/roles');
const { createListsService }   = require('./lists/service');
const { createCustomersService } = require('./customers/service');
const { createDressesService } = require('./dresses/service');
const { createBookingsService } = require('./bookings/service');
const { createPaymentsService } = require('./payments/service');
const { createBackupService }   = require('./backup/service');
const { createAvailabilityService } = require('./availability/service');
const { createSearchService }   = require('./search/service');
const { createSettingsService } = require('./settings/service');
const { createReceiptsService } = require('./receipts/service');
const { createTrackingService } = require('./tracking/service');
const { createReportsService } = require('./reports/service');
const { createSyncService }    = require('./sync/service');
const { importAccessData }     = require('../scripts/import-access');
const { verifyLicense, assertLicenseValid } = require('./licensing/validator');
const { getFriendlyMachineCode } = require('./licensing/hwid');
const { activateOnline }       = require('./licensing/activation');

// Register bytenode runtime for V8 bytecode execution
try {
  require('bytenode');
} catch {}

try {
  app.setName('Ifrah Collection POS');
} catch {}

const isDev = process.env.ELECTRON_DEV === '1';

// Hardened Anti-Debugging: Strip inspection switches in production
if (!isDev) {
  try {
    app.commandLine.removeSwitch('inspect');
    app.commandLine.removeSwitch('inspect-brk');
    app.commandLine.removeSwitch('remote-debugging-port');
    app.commandLine.removeSwitch('disable-web-security');
  } catch {}
}
const sessions = new Map();
let auth;
let lists;
let customers;
let dresses;
let bookings;
let payments;
let backup;
let availability;
let search;
let settingsService;
let receiptsService;
let tracking;
let reports;
let syncService;
let staticServer = null;

function getSession(event) { return sessions.get(event.sender.id); }
function protect(event, roles) { return requireRole(getSession(event), roles); }

function safeHandler(handler, options = {}) {
  return async (...args) => {
    try {
      if (!options.skipSecurityCheck) {
        // Only enforce if a license file exists (i.e. machine has been activated before)
        // Pre-activation: the activation IPC itself handles the flow
        try {
          assertLicenseValid(app);
        } catch (secErr) {
          const msg = secErr.message || '';
          // Block on tamper/mismatch. Allow through on NO_LICENSE (unactivated) — UI handles it
          if (msg.includes('HARDWARE_MISMATCH') || msg.includes('SIGNATURE_TAMPERED') || msg.includes('CORRUPTED_FILE')) {
            return { ok: false, message: 'Security tasdeeq fail ho gayi. Ghair-tasdeeq shuda machine ya tampered file.' };
          }
          // NO_LICENSE — let the request proceed; the UI will show the ActivationModal
        }
      }
      return await handler(...args);
    } catch (error) {
      if (error instanceof AuthorizationError)
        return { ok: false, code: error.code, message: error.message };
      console.error('[IPC]', error);
      let msg = error.message || 'Kuch masla pesh aya hai.';
      if (msg.includes('SQLITE_BUSY')) msg = 'Database masroof hai. Barah-e-karam dobara koshish karein.';
      if (msg.includes('UNIQUE constraint failed')) msg = 'Ye record pehle se mojood hai (duplicate record).';
      if (msg.includes('NOT NULL constraint failed')) msg = 'Zaroori maloomat darj nahi ki gayi.';
      return { ok: false, message: msg };
    }
  };
}

// ─── Local Static HTTP Server for Production Export ──────────────────────────
const MIME_TYPES = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.txt':   'text/plain; charset=utf-8',
  '.wasm':  'application/wasm',
};

function startStaticServer(outDir) {
  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(parsedUrl.pathname);

      // Prevent directory traversal attacks
      const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
      const fullPath = path.join(outDir, safePath);

      const candidates = [];
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        candidates.push(fullPath);
      } else {
        candidates.push(path.join(fullPath, 'index.html'));
        candidates.push(`${fullPath}.html`);
        candidates.push(path.join(outDir, 'index.html'));
      }

      let targetFile = null;
      for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          targetFile = cand;
          break;
        }
      }

      if (!targetFile) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(targetFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileData = fs.readFileSync(targetFile);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileData.length,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' data:; connect-src 'self' https://*.supabase.co; img-src 'self' data: file: blob:; font-src 'self' data:;",
      });
      res.end(fileData);
    } catch (err) {
      console.error('[Static Server Error]', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Server Error');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      console.log(`[Static Server] Serving offline POS on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

// ─── Window ────────────────────────────────────────────────────────────────
function createWindow(serverPort) {
  const iconPath = path.join(__dirname, '../public/icon.ico');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Ifrah Collection POS',
    backgroundColor: '#0f0e1a',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (!isDev) {
    // Automatically close DevTools if triggered or attached
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });

    // Block keyboard inspection shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U, Ctrl+R)
    win.webContents.on('before-input-event', (event, input) => {
      const isCtrlOrCmd = input.control || input.meta;
      if (
        input.key === 'F12' ||
        (isCtrlOrCmd && input.shift && ['I', 'i', 'J', 'j', 'C', 'c'].includes(input.key)) ||
        (isCtrlOrCmd && ['U', 'u', 'R', 'r'].includes(input.key))
      ) {
        event.preventDefault();
      }
    });

    // Block right-click context menu (prevents "Inspect Element")
    win.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });
  }

  const appUrl = isDev ? 'http://localhost:3000' : `http://127.0.0.1:${serverPort}`;
  win.loadURL(appUrl);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Seed default list values at startup ────────────────────────────────────
function seedDefaults() {
  lists.seedIfMissing('relation_types', [
    'Wife', 'Husband', 'Son', 'Daughter',
    'Father', 'Mother', 'Brother', 'Sister',
    'Chacha', 'Taya', 'Mama', 'Phuphi', 'Khala',
    'Nand', 'Bhabhi', 'Devrani', 'Jethani', 'Friend',
  ]);
  lists.seedIfMissing('dress_categories', [
    'Lehenga', 'Gharara', 'Sharara', 'Saree',
    'Anarkali Suit', 'Shalwar Kameez', 'Bridal Set', 'Other',
  ]);
  lists.seedIfMissing('cities', [
    'Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad',
    'Multan', 'Gujranwala', 'Sialkot', 'Peshawar', 'Quetta',
    'Sargodha', 'Bahawalpur', 'Sheikhupura', 'Gujrat', 'Kasur',
  ]);
  lists.seedIfMissing('casts', [
    'Jatt', 'Arain', 'Rajput', 'Malik', 'Gujjar', 'Sheikh',
    'Syed', 'Butt', 'Mughal', 'Ansari', 'Qureshi', 'Khokhar',
    'Awan', 'Kashmiri', 'Chaudhry', 'Other',
  ]);
}

let appPort = 3000;

// ─── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Startup integrity check: only act on tamper/mismatch, not on unlicensed
  const licStatus = verifyLicense(app, { allowDissolve: true });
  if (!licStatus.licensed && licStatus.reason !== 'NO_LICENSE') {
    console.error('[License] Startup integrity check failed:', licStatus.reason);
    // triggerDissolve already called inside verifyLicense for mismatch/tamper
  }

  const db  = getDb();
  auth         = createAuthService(db);
  lists        = createListsService(db);
  customers    = createCustomersService(db);
  dresses      = createDressesService(db, app);
  bookings     = createBookingsService(db);
  payments     = createPaymentsService(db);
  backup       = createBackupService(db, app, dialog, shell);
  availability = createAvailabilityService(db);
  search       = createSearchService(db);
  settingsService = createSettingsService(db);
  receiptsService = createReceiptsService(db, settingsService, bookings);
  tracking        = createTrackingService(db, bookings, payments);
  reports         = createReportsService(db, settingsService);
  syncService     = createSyncService(db);

  // Phase 14: Hardened Content-Security-Policy enforcement
  if (session && session.defaultSession) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' https://*.supabase.co http://127.0.0.1:* ws://127.0.0.1:* http://localhost:*; img-src 'self' data: file: blob:; font-src 'self' data:;",
          ],
        },
      });
    });
  }

  seedDefaults();

  // Phase 12: Automated daily backup check on startup
  backup.autoBackupOnStartup().catch(err => {
    console.warn('[Startup] Auto backup warning:', err.message);
  });

  // Phase 13: Supabase Cloud & Offline Sync on startup
  syncService.syncNow().catch(err => {
    console.warn('[Startup] Cloud sync notice:', err.message);
  });

  // Periodic background sync every 60 seconds
  setInterval(() => {
    if (syncService) syncService.syncNow().catch(() => {});
  }, 60000);

  if (!isDev) {
    const outDir = path.resolve(__dirname, '../out');
    const started = await startStaticServer(outDir);
    staticServer = started.server;
    appPort = started.port;
  }

  createWindow(appPort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(appPort);
  });
});

app.on('window-all-closed', async () => {
  if (backup && typeof backup.autoBackupOnShutdown === 'function') {
    try {
      await backup.autoBackupOnShutdown();
    } catch {}
  }
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC — Auth ────────────────────────────────────────────────────────────
ipcMain.handle('auth:needs-setup', safeHandler(() => ({ needsSetup: auth.needsSetup() })));
ipcMain.handle('auth:setup-owner', safeHandler(async (_event, input) => auth.setupOwner(input)));
ipcMain.handle('auth:login',  safeHandler(async (event, input) => {
  const result = await auth.authenticate(input.username, input.password);
  if (result.ok) sessions.set(event.sender.id, { active: true, user: result.user });
  return result;
}));
ipcMain.handle('auth:logout', safeHandler((event) => {
  sessions.delete(event.sender.id);
  return { ok: true };
}));
ipcMain.handle('auth:session', safeHandler((event) => {
  const session = getSession(event);
  return session?.active ? { ok: true, user: session.user } : { ok: false };
}));
ipcMain.handle('auth:request-reset', safeHandler(async (_event, input) => auth.requestPasswordReset(input)));
ipcMain.handle('auth:reset-with-code', safeHandler(async (_event, input) => auth.resetPasswordWithCode(input)));
ipcMain.handle('auth:reset-with-key', safeHandler(async (_event, input) => auth.resetPasswordWithRecoveryKey(input)));
ipcMain.handle('auth:recover-username', safeHandler(async (_event, input) => auth.recoverUsername(input)));
ipcMain.handle('auth:get-recovery-key', safeHandler((event) => auth.getRecoveryKeyForOwner(getSession(event))));

// ─── IPC — Users ───────────────────────────────────────────────────────────
ipcMain.handle('users:list',    safeHandler((event)         => auth.listUsers(getSession(event))));
ipcMain.handle('users:create',  safeHandler((event, input)  => auth.createUser(getSession(event), input)));
ipcMain.handle('users:disable', safeHandler((event, userId) => auth.disableUser(getSession(event), userId)));

// ─── IPC — Audit ───────────────────────────────────────────────────────────
ipcMain.handle('audit:list', safeHandler((event) => auth.listAuditLogs(getSession(event))));

// ─── IPC — Lists (learning dropdowns) ──────────────────────────────────────
ipcMain.handle('lists:get',     safeHandler((_e, tableName)           => ({ ok: true, data: lists.list(tableName) })));
ipcMain.handle('lists:add',     safeHandler((event, tableName, name)  => ({ ok: true, ...lists.add(getSession(event), tableName, name) })));
ipcMain.handle('lists:rename',  safeHandler((event, tableName, id, n) => lists.rename(getSession(event), tableName, id, n)));
ipcMain.handle('lists:disable', safeHandler((event, tableName, id)    => lists.disable(getSession(event), tableName, id)));

// ─── IPC — Customers ───────────────────────────────────────────────────────
ipcMain.handle('customers:list',          safeHandler((event, filters)   => ({ ok: true, data: customers.list(getSession(event), filters) })));
ipcMain.handle('customers:get',           safeHandler((event, id)        => ({ ok: true, data: customers.get(getSession(event), id) })));
ipcMain.handle('customers:findDuplicate', safeHandler((_e, name, phone)  => ({ ok: true, data: customers.findDuplicate(name, phone) })));
ipcMain.handle('customers:create',        safeHandler((event, input)     => ({ ok: true, ...customers.create(getSession(event), input) })));
ipcMain.handle('customers:update',        safeHandler((event, id, input) => customers.update(getSession(event), id, input)));
ipcMain.handle('customers:delete',        safeHandler((event, id)        => customers.softDelete(getSession(event), id)));

// ─── IPC — Dresses ─────────────────────────────────────────────────────────
ipcMain.handle('dresses:list',          safeHandler((event, filters) => ({ ok: true, data: dresses.list(getSession(event), filters) })));
ipcMain.handle('dresses:get',           safeHandler((event, id)      => ({ ok: true, data: dresses.get(getSession(event), id) })));
ipcMain.handle('dresses:suggestSimilar',safeHandler((_e, name)       => ({ ok: true, data: dresses.suggestSimilar(name) })));
ipcMain.handle('dresses:nextCode',      safeHandler((_e)             => ({ ok: true, code: dresses.nextCode() })));
ipcMain.handle('dresses:create',        safeHandler((event, input)   => ({ ok: true, ...dresses.create(getSession(event), input) })));
ipcMain.handle('dresses:update',        safeHandler((event, id, inp) => dresses.update(getSession(event), id, inp)));
ipcMain.handle('dresses:setActive',     safeHandler((event, id, act) => dresses.setActive(getSession(event), id, act)));
ipcMain.handle('dresses:quickAdd',      safeHandler((event, name)    => ({ ok: true, ...dresses.quickAdd(getSession(event), name) })));
ipcMain.handle('dresses:history',       safeHandler((event, id, flt) => ({ ok: true, data: dresses.getHistory(getSession(event), id, flt) })));

// ─── IPC — Bookings ────────────────────────────────────────────────────────
ipcMain.handle('bookings:list',        safeHandler((event, filters)   => ({ ok: true, data: bookings.list(getSession(event), filters) })));
ipcMain.handle('bookings:get',         safeHandler((event, id)        => ({ ok: true, data: bookings.get(getSession(event), id) })));
ipcMain.handle('bookings:getByNo',     safeHandler((event, no)        => ({ ok: true, data: bookings.getByNo(getSession(event), no) })));
ipcMain.handle('bookings:nextNo',      safeHandler((_e)               => ({ ok: true, booking_no: bookings.nextBookingNo() })));
ipcMain.handle('bookings:create',      safeHandler((event, input)     => ({ ok: true, ...bookings.create(getSession(event), input) })));
ipcMain.handle('bookings:update',      safeHandler((event, id, input) => bookings.update(getSession(event), id, input)));
ipcMain.handle('bookings:delete',      safeHandler((event, id)        => bookings.softDelete(getSession(event), id)));
ipcMain.handle('bookings:todaySummary',safeHandler((event)             => ({ ok: true, data: tracking ? tracking.getTrackingSummary(getSession(event)) : bookings.todaySummary() })));
ipcMain.handle('bookings:canClose',    safeHandler((_e, id)           => ({ ok: true, data: bookings.canClose(id) })));
ipcMain.handle('bookings:setStatus',   safeHandler((event, id, st, op)=> bookings.setStatus(getSession(event), id, st, op)));

// ─── IPC — Payments ────────────────────────────────────────────────────────
ipcMain.handle('payments:create',       safeHandler((event, input)      => ({ ok: true, ...payments.create(getSession(event), input) })));
ipcMain.handle('payments:void',         safeHandler((event, id, reason) => payments.voidPayment(getSession(event), id, { reason })));
ipcMain.handle('payments:listByBooking',safeHandler((event, bookingId)  => ({ ok: true, data: payments.listByBooking(getSession(event), bookingId) })));
ipcMain.handle('payments:listAll',      safeHandler((event, filters)    => ({ ok: true, data: payments.listAll(getSession(event), filters) })));
ipcMain.handle('payments:summary',      safeHandler((event, filters)    => ({ ok: true, data: payments.getSummary(getSession(event), filters) })));

// ─── IPC — Backup (Phase 5 & Phase 12) ──────────────────────────────────
ipcMain.handle('backup:create',        safeHandler((event, options)    => backup.createBackup(getSession(event), options)));
ipcMain.handle('backup:createArchive', safeHandler((event, options)    => backup.createArchiveBackup(getSession(event), options)));
ipcMain.handle('backup:chooseAndSave', safeHandler((event)             => backup.chooseAndSaveBackup(getSession(event))));
ipcMain.handle('backup:list',          safeHandler((event)             => ({ ok: true, data: backup.listBackups(getSession(event)) })));
ipcMain.handle('backup:status',        safeHandler((event)             => backup.getStatus(getSession(event))));
ipcMain.handle('backup:inspect',       safeHandler((event, filePath)   => backup.inspectBackup(getSession(event), filePath)));
ipcMain.handle('backup:restore',       safeHandler((event, options)    => backup.restoreBackup(getSession(event), options)));
ipcMain.handle('backup:openFolder',    safeHandler((event)             => backup.openBackupFolder(getSession(event))));

// ─── IPC — Availability (Phase 6) ──────────────────────────────────────────
ipcMain.handle('availability:checkClash',    safeHandler((event, params)  => ({ ok: true, data: availability.checkClash(getSession(event), params) })));
ipcMain.handle('availability:getDresses',    safeHandler((event, params)  => ({ ok: true, data: availability.getAvailability(getSession(event), params) })));
ipcMain.handle('availability:getBookedRanges', safeHandler((event, dressId) => ({ ok: true, data: availability.getBookedRanges(getSession(event), dressId) })));
ipcMain.handle('availability:logOverride',   safeHandler((event, params)  => availability.logClashOverride(getSession(event), params)));

// ─── IPC — Search (Phase 7) ─────────────────────────────────────────────────
ipcMain.handle('search:query',  safeHandler((event, filters) => ({ ok: true, data: search.search(getSession(event), filters) })));
ipcMain.handle('search:count',  safeHandler((event, filters) => ({ ok: true, ...search.count(getSession(event), filters) })));

// ─── IPC — Settings (Phase 8) ───────────────────────────────────────────────
ipcMain.handle('settings:get',    safeHandler((event)        => ({ ok: true, data: settingsService.getSettings(getSession(event)) })));
ipcMain.handle('settings:update', safeHandler((event, input) => settingsService.updateSettings(getSession(event), input)));

// ─── IPC — Receipts & Printing (Phase 8) ────────────────────────────────────
ipcMain.handle('receipts:getData',      safeHandler((event, bookingId) => receiptsService.getReceiptData(getSession(event), bookingId)));
ipcMain.handle('receipts:getPrinters',  safeHandler((event)            => ({ ok: true, data: receiptsService.getPrinters(getSession(event)) })));
ipcMain.handle('receipts:generateHtml', safeHandler((event, params)    => receiptsService.generateHtml(getSession(event), params)));
ipcMain.handle('receipts:print',        safeHandler((event, params)    => receiptsService.printDirect(getSession(event), params)));
ipcMain.handle('receipts:savePdf',      safeHandler((event, params)    => receiptsService.savePdf(getSession(event), params)));
ipcMain.handle('receipts:recordPrint',  safeHandler((event, bookingId) => receiptsService.recordPrint(getSession(event), bookingId)));

// ─── IPC — Tracking (Phase 9 Delivery & Return) ───────────────────────────
ipcMain.handle('tracking:listDeliveries',  safeHandler((event, params) => ({ ok: true, data: tracking.listDeliveries(getSession(event), params) })));
ipcMain.handle('tracking:listReturns',     safeHandler((event, params) => ({ ok: true, data: tracking.listReturns(getSession(event), params) })));
ipcMain.handle('tracking:markDelivered',   safeHandler((event, params) => tracking.markDelivered(getSession(event), params)));
ipcMain.handle('tracking:unmarkDelivered', safeHandler((event, bId)    => tracking.unmarkDelivered(getSession(event), bId)));
ipcMain.handle('tracking:markReturned',    safeHandler((event, params) => tracking.markReturned(getSession(event), params)));
ipcMain.handle('tracking:unmarkReturned',  safeHandler((event, bId)    => tracking.unmarkReturned(getSession(event), bId)));
ipcMain.handle('tracking:toggleItemReady', safeHandler((event, params) => tracking.toggleItemReady(getSession(event), params)));
ipcMain.handle('tracking:summary',         safeHandler((event)         => ({ ok: true, data: tracking.getTrackingSummary(getSession(event)) })));

// ─── IPC — Reports (Phase 10) ──────────────────────────────────────────────
ipcMain.handle('reports:get',              safeHandler((event, params) => ({ ok: true, data: reports.getReportData(getSession(event), params) })));
ipcMain.handle('reports:generateHtml',     safeHandler((event, params) => reports.generateReportHtml(getSession(event), params)));
ipcMain.handle('reports:exportExcel',      safeHandler((event, params) => reports.exportExcel(getSession(event), params)));
ipcMain.handle('reports:exportPdf',        safeHandler((event, params) => reports.exportPdf(getSession(event), params)));
ipcMain.handle('reports:print',            safeHandler((event, params) => reports.printDirect(getSession(event), params)));
ipcMain.handle('reports:exportEverything', safeHandler((event, params) => reports.exportEverything(getSession(event), params)));
ipcMain.handle('reports:printDailyPack',   safeHandler((event, params) => reports.printDailyPack(getSession(event), params)));

// ─── IPC — Migration (Phase 11 MS Access) ──────────────────────────────────
ipcMain.handle('migration:preview', safeHandler((event, params) => {
  protect(event, [ROLES.OWNER]);
  return { ok: true, data: importAccessData({ ...params, dryRun: true }) };
}));
ipcMain.handle('migration:run', safeHandler(async (event, params) => {
  protect(event, [ROLES.OWNER]);
  const activeDb = getDb();
  const result = importAccessData({ ...params, dryRun: false, db: activeDb });

  // Phase 13: Push imported data to Supabase Cloud immediately
  try {
    if (syncService && typeof syncService.syncNow === 'function') {
      await syncService.syncNow();
    }
  } catch (syncErr) {
    console.warn('[Migration] Note pushing imported data to Supabase:', syncErr.message);
  }

  return { ok: true, data: result };
}));

// ─── IPC — Sync (Phase 13 Supabase Cloud & Offline Sync) ───────────────────
ipcMain.handle('sync:status',          safeHandler((event)            => ({ ok: true, data: syncService.getStatus() })));
ipcMain.handle('sync:trigger',         safeHandler((event)            => syncService.syncNow()));
ipcMain.handle('sync:setDeviceConfig', safeHandler((event, config)    => syncService.setDeviceConfig(getSession(event), config)));
ipcMain.handle('sync:resolveClash',    safeHandler((event, bookingId) => syncService.resolveClash(getSession(event), bookingId)));

// ─── IPC — App ─────────────────────────────────────────────────────────────
ipcMain.handle('app:version',  safeHandler((event) => { protect(event, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]); return app.getVersion(); }));
ipcMain.handle('app:platform', safeHandler((event) => { protect(event, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]); return process.platform; }));
ipcMain.handle('app:minimize', safeHandler((e) => { protect(e, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]); BrowserWindow.fromWebContents(e.sender)?.minimize(); }));
ipcMain.handle('app:maximize', safeHandler((e) => {
  protect(e, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
}));
ipcMain.handle('app:close', safeHandler((e) => { protect(e, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]); BrowserWindow.fromWebContents(e.sender)?.close(); }));

// ─── IPC — Licensing & Anti-Piracy ──────────────────────────────────────────
ipcMain.handle('license:check', safeHandler(() => {
  return verifyLicense(app, { allowDissolve: true });
}));
ipcMain.handle('license:get-machine-code', safeHandler(() => {
  return { ok: true, machineCode: getFriendlyMachineCode() };
}));
ipcMain.handle('license:activate', safeHandler(async (_event, key) => {
  return await activateOnline(app, key);
}));
