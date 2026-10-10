const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

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
}

// ─── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ──────────────────────────────────────────────────────────
// These are registered here; database handlers will be added in Phase 1

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app:platform', () => process.platform);

// Window controls
ipcMain.handle('app:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});

ipcMain.handle('app:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});

ipcMain.handle('app:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
