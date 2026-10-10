/**
 * Electron Preload Script
 *
 * This is the ONLY bridge between the renderer (Next.js UI) and the
 * Electron main process. It exposes a safe, limited API via contextBridge.
 *
 * Security rules:
 *  - contextIsolation: true  → renderer cannot access Node/Electron directly
 *  - Only expose what is strictly needed
 *  - Validate all inputs before passing to ipcRenderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── App Info ─────────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  // ── Window Controls ───────────────────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close:    () => ipcRenderer.invoke('app:close'),

  // ── Database (Phase 1 — SQLite) ───────────────────────────────────────────
  // These will be implemented when SQLite is set up in Phase 1.
  // Defined here so the UI can call them safely without crashing.
  db: {
    query: (sql, params = []) => ipcRenderer.invoke('db:query', sql, params),
    run:   (sql, params = []) => ipcRenderer.invoke('db:run',   sql, params),
    all:   (sql, params = []) => ipcRenderer.invoke('db:all',   sql, params),
    get:   (sql, params = []) => ipcRenderer.invoke('db:get',   sql, params),
  },
});
