/**
 * electron/preload.js
 *
 * The ONLY bridge between the renderer (Next.js) and Electron main process.
 * contextIsolation: true → renderer cannot access Node/Electron directly.
 *
 * Naming: window.electronAPI.<module>.<action>()
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

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    needsSetup: ()       => ipcRenderer.invoke('auth:needs-setup'),
    setupOwner: (input)  => ipcRenderer.invoke('auth:setup-owner', input),
    login:  (input)      => ipcRenderer.invoke('auth:login', input),
    logout: ()           => ipcRenderer.invoke('auth:logout'),
    session: ()          => ipcRenderer.invoke('auth:session'),
  },

  // ── Users (Owner only) ───────────────────────────────────────────────────
  users: {
    list:    ()          => ipcRenderer.invoke('users:list'),
    create:  (input)     => ipcRenderer.invoke('users:create', input),
    disable: (userId)    => ipcRenderer.invoke('users:disable', userId),
  },

  // ── Audit (Owner only) ────────────────────────────────────────────────────
  audit: {
    list: () => ipcRenderer.invoke('audit:list'),
  },

  // ── Lists — learning dropdowns ────────────────────────────────────────────
  // tableName: 'cities' | 'casts' | 'relation_types' | 'dress_categories'
  lists: {
    get:     (tableName)           => ipcRenderer.invoke('lists:get', tableName),
    add:     (tableName, name)     => ipcRenderer.invoke('lists:add', tableName, name),
    rename:  (tableName, id, name) => ipcRenderer.invoke('lists:rename', tableName, id, name),
    disable: (tableName, id)       => ipcRenderer.invoke('lists:disable', tableName, id),
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  customers: {
    list:          (filters)   => ipcRenderer.invoke('customers:list', filters),
    get:           (id)        => ipcRenderer.invoke('customers:get', id),
    findDuplicate: (name, ph)  => ipcRenderer.invoke('customers:findDuplicate', name, ph),
    create:        (input)     => ipcRenderer.invoke('customers:create', input),
    update:        (id, input) => ipcRenderer.invoke('customers:update', id, input),
    delete:        (id)        => ipcRenderer.invoke('customers:delete', id),
  },

  // ── Dresses ───────────────────────────────────────────────────────────────
  dresses: {
    list:          (filters) => ipcRenderer.invoke('dresses:list', filters),
    get:           (id)      => ipcRenderer.invoke('dresses:get', id),
    suggestSimilar:(name)    => ipcRenderer.invoke('dresses:suggestSimilar', name),
    nextCode:      ()        => ipcRenderer.invoke('dresses:nextCode'),
    create:        (input)   => ipcRenderer.invoke('dresses:create', input),
    update:        (id, inp) => ipcRenderer.invoke('dresses:update', id, inp),
    setActive:     (id, act) => ipcRenderer.invoke('dresses:setActive', id, act),
    quickAdd:      (name)    => ipcRenderer.invoke('dresses:quickAdd', name),
  },

  // ── Bookings ──────────────────────────────────────────────────────────────
  bookings: {
    list:          (filters)   => ipcRenderer.invoke('bookings:list', filters),
    get:           (id)        => ipcRenderer.invoke('bookings:get', id),
    getByNo:       (no)        => ipcRenderer.invoke('bookings:getByNo', no),
    nextNo:        ()          => ipcRenderer.invoke('bookings:nextNo'),
    create:        (input)     => ipcRenderer.invoke('bookings:create', input),
    update:        (id, input) => ipcRenderer.invoke('bookings:update', id, input),
    delete:        (id)        => ipcRenderer.invoke('bookings:delete', id),
    recalcTotals:  (id)        => ipcRenderer.invoke('bookings:recalcTotals', id),
    todaySummary:  ()          => ipcRenderer.invoke('bookings:todaySummary'),
  },
});
