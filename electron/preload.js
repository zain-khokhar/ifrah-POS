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

  auth: {
    needsSetup: () => ipcRenderer.invoke('auth:needs-setup'),
    setupOwner: (input) => ipcRenderer.invoke('auth:setup-owner', input),
    login: (input) => ipcRenderer.invoke('auth:login', input),
    logout: () => ipcRenderer.invoke('auth:logout'),
    session: () => ipcRenderer.invoke('auth:session'),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (input) => ipcRenderer.invoke('users:create', input),
    disable: (userId) => ipcRenderer.invoke('users:disable', userId),
  },
  audit: {
    list: () => ipcRenderer.invoke('audit:list'),
  },
});
