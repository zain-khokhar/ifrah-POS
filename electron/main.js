const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

const isDev = process.env.ELECTRON_DEV === '1';
const sessions = new Map();
let auth;
let lists;
let customers;
let dresses;
let bookings;
let staticServer = null;

function getSession(event) { return sessions.get(event.sender.id); }
function protect(event, roles) { return requireRole(getSession(event), roles); }

function safeHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AuthorizationError)
        return { ok: false, code: error.code, message: error.message };
      console.error('[IPC]', error);
      return { ok: false, message: error.message || 'Something went wrong.' };
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
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Ifrah Collection POS',
    backgroundColor: '#0f0e1a',
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
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

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
  const db  = getDb();
  auth      = createAuthService(db);
  lists     = createListsService(db);
  customers = createCustomersService(db);
  dresses   = createDressesService(db, app);
  bookings  = createBookingsService(db);

  seedDefaults();

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

app.on('window-all-closed', () => {
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

// ─── IPC — Bookings ────────────────────────────────────────────────────────
ipcMain.handle('bookings:list',        safeHandler((event, filters)   => ({ ok: true, data: bookings.list(getSession(event), filters) })));
ipcMain.handle('bookings:get',         safeHandler((event, id)        => ({ ok: true, data: bookings.get(getSession(event), id) })));
ipcMain.handle('bookings:getByNo',     safeHandler((event, no)        => ({ ok: true, data: bookings.getByNo(getSession(event), no) })));
ipcMain.handle('bookings:nextNo',      safeHandler((_e)               => ({ ok: true, booking_no: bookings.nextBookingNo() })));
ipcMain.handle('bookings:create',      safeHandler((event, input)     => ({ ok: true, ...bookings.create(getSession(event), input) })));
ipcMain.handle('bookings:update',      safeHandler((event, id, input) => bookings.update(getSession(event), id, input)));
ipcMain.handle('bookings:delete',      safeHandler((event, id)        => bookings.softDelete(getSession(event), id)));
ipcMain.handle('bookings:recalcTotals',safeHandler((_e, id)           => { bookings.recalcTotals(id); return { ok: true }; }));
ipcMain.handle('bookings:todaySummary',safeHandler((_e)               => ({ ok: true, data: bookings.todaySummary() })));

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
