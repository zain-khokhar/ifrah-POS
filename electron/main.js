const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { getDb, closeDb } = require('./database/db');
const { createAuthService } = require('./auth/service');
const { requireRole, ROLES, AuthorizationError } = require('./auth/roles');

const isDev = process.env.ELECTRON_DEV === '1';
const sessions = new Map();
let auth;

function getSession(event) {
  return sessions.get(event.sender.id);
}

function protect(event, roles) {
  return requireRole(getSession(event), roles);
}

function safeHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AuthorizationError) return { ok: false, code: error.code, message: error.message };
      console.error('[IPC]', error);
      return { ok: false, message: error.message || 'Something went wrong.' };
    }
  };
}

// ─── Window ────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Ifrah Collection POS',
    backgroundColor: '#0f0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // Security: renderer cannot access Node
      nodeIntegration: false,   // Security: no Node in renderer
      sandbox: false,           // Needed for preload to work with better-sqlite3
    },
    show: false, // Prevent white flash on load
  });

  // Show window only when ready to display
  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });
  win.webContents.once('did-finish-load', () => win.show());
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Window] Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    win.show();
  });

  if (!isDev) {
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['file://*/*/_next/*'] }, (details, callback) => {
      const pathname = decodeURIComponent(new URL(details.url).pathname);
      if (pathname.includes('/out/_next/')) return callback({});
      const nextIndex = pathname.indexOf('/_next/');
      if (nextIndex === -1) return callback({});
      const target = path.join(__dirname, '../out', pathname.slice(nextIndex + 1));
      callback({ redirectURL: pathToFileURL(target).toString() });
    });
  }

  if (isDev) {
    // Dev: load from Next.js dev server
    win.loadURL('http://localhost:3000');
  } else {
    // Production: load static export
    win.loadFile(path.join(__dirname, '../out/index.html'));
  }

  // Open external links in default browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Next client-side routes become absolute file:// paths on Windows.
  // Map those routes back into the static export instead of the drive root.
  if (!isDev) {
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('file://')) return;
      const route = decodeURIComponent(new URL(url).pathname)
        .replace(/^\/+[A-Za-z]:/, '')
        .replace(/^\/+|\/+$/g, '');
      const target = route
        ? path.join(__dirname, '../out', route, 'index.html')
        : path.join(__dirname, '../out/index.html');
      if (!fs.existsSync(target)) return;
      event.preventDefault();
      win.loadFile(target);
    });
  }
}

// ─── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  auth = createAuthService(getDb());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ──────────────────────────────────────────────────────────
// These are registered here; database handlers will be added in Phase 1

ipcMain.handle('auth:needs-setup', safeHandler(() => ({ needsSetup: auth.needsSetup() })));

ipcMain.handle('auth:setup-owner', safeHandler(async (_event, input) => auth.setupOwner(input)));

ipcMain.handle('auth:login', safeHandler(async (event, input) => {
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

ipcMain.handle('users:list', safeHandler((event) => auth.listUsers(getSession(event))));

ipcMain.handle('users:create', safeHandler(async (event, input) => auth.createUser(
  getSession(event), input,
)));

ipcMain.handle('users:disable', safeHandler((event, userId) => auth.disableUser(
  getSession(event), userId,
)));

ipcMain.handle('audit:list', safeHandler((event) => auth.listAuditLogs(getSession(event))));

ipcMain.handle('app:version', safeHandler((event) => {
  protect(event, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
  return app.getVersion();
}));

ipcMain.handle('app:platform', safeHandler((event) => {
  protect(event, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
  return process.platform;
}));

// Window controls
ipcMain.handle('app:minimize', safeHandler((e) => {
  protect(e, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
  BrowserWindow.fromWebContents(e.sender)?.minimize();
}));

ipcMain.handle('app:maximize', safeHandler((e) => {
  protect(e, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
}));

ipcMain.handle('app:close', safeHandler((e) => {
  protect(e, [ROLES.OWNER, ROLES.CASHIER, ROLES.VIEWER]);
  BrowserWindow.fromWebContents(e.sender)?.close();
}));
