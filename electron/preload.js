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
    needsSetup: ()               => ipcRenderer.invoke('auth:needs-setup'),
    setupOwner: (input)          => ipcRenderer.invoke('auth:setup-owner', input),
    login:  (input)              => ipcRenderer.invoke('auth:login', input),
    logout: ()                   => ipcRenderer.invoke('auth:logout'),
    session: ()                  => ipcRenderer.invoke('auth:session'),
    requestReset: (input)        => ipcRenderer.invoke('auth:request-reset', input),
    resetWithCode: (input)       => ipcRenderer.invoke('auth:reset-with-code', input),
    resetWithKey: (input)        => ipcRenderer.invoke('auth:reset-with-key', input),
    recoverUsername: (input)     => ipcRenderer.invoke('auth:recover-username', input),
    getRecoveryKey: ()           => ipcRenderer.invoke('auth:get-recovery-key'),
  },

  // ── Users (Owner only) ───────────────────────────────────────────────────
  users: {
    list:    ()          => ipcRenderer.invoke('users:list'),
    create:  (input)     => ipcRenderer.invoke('users:create', input),
    disable: (userId)    => ipcRenderer.invoke('users:disable', userId),
  },

  // ── Audit (Owner only) ────────────────────────────────────────────────────
  audit: {
    list: (params) => ipcRenderer.invoke('audit:list', params),
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
    canClose:      (id)        => ipcRenderer.invoke('bookings:canClose', id),
    setStatus:     (id, st, op)=> ipcRenderer.invoke('bookings:setStatus', id, st, op),
  },

  // ─── Payments ─────────────────────────────────────────────────────────────
  payments: {
    create:        (input)          => ipcRenderer.invoke('payments:create', input),
    void:          (id, reason)     => ipcRenderer.invoke('payments:void', id, reason),
    listByBooking: (bookingId)      => ipcRenderer.invoke('payments:listByBooking', bookingId),
    listAll:       (filters)        => ipcRenderer.invoke('payments:listAll', filters),
    summary:       (filters)        => ipcRenderer.invoke('payments:summary', filters),
  },

  // ─── Backup (Phase 5 & Phase 12) ──────────────────────────────────────────
  backup: {
    create:        (options)        => ipcRenderer.invoke('backup:create', options),
    createArchive: (options)        => ipcRenderer.invoke('backup:createArchive', options),
    chooseAndSave: ()               => ipcRenderer.invoke('backup:chooseAndSave'),
    list:          ()               => ipcRenderer.invoke('backup:list'),
    status:        ()               => ipcRenderer.invoke('backup:status'),
    inspect:       (filePath)       => ipcRenderer.invoke('backup:inspect', filePath),
    restore:       (options)        => ipcRenderer.invoke('backup:restore', options),
    openFolder:    ()               => ipcRenderer.invoke('backup:openFolder'),
  },

  // ─── Availability (Phase 6) ───────────────────────────────────────────────
  // checkClash: { available: bool, clashes: [] }
  availability: {
    checkClash:     (params)   => ipcRenderer.invoke('availability:checkClash', params),
    getDresses:     (params)   => ipcRenderer.invoke('availability:getDresses', params),
    getBookedRanges:(dressId)  => ipcRenderer.invoke('availability:getBookedRanges', dressId),
    logOverride:    (params)   => ipcRenderer.invoke('availability:logOverride', params),
  },

  // ─── Search (Phase 7) ─────────────────────────────────────────────────────
  // filters: { q, status, month, dateFrom, dateTo, dateField, cityId, castId, limit, offset }
  search: {
    query: (filters) => ipcRenderer.invoke('search:query', filters),
    count: (filters) => ipcRenderer.invoke('search:count', filters),
  },

  // ─── Settings (Phase 8) ───────────────────────────────────────────────────
  settings: {
    get:    ()      => ipcRenderer.invoke('settings:get'),
    update: (input) => ipcRenderer.invoke('settings:update', input),
  },

  // ─── Receipts & Printing (Phase 8) ────────────────────────────────────────
  receipts: {
    getData:      (bookingId) => ipcRenderer.invoke('receipts:getData', bookingId),
    getPrinters:  ()          => ipcRenderer.invoke('receipts:getPrinters'),
    generateHtml: (params)    => ipcRenderer.invoke('receipts:generateHtml', params),
    print:        (params)    => ipcRenderer.invoke('receipts:print', params),
    savePdf:      (params)    => ipcRenderer.invoke('receipts:savePdf', params),
    recordPrint:  (bookingId) => ipcRenderer.invoke('receipts:recordPrint', bookingId),
  },

  // ─── Tracking (Phase 9 Delivery & Return) ─────────────────────────────────
  tracking: {
    listDeliveries:  (params) => ipcRenderer.invoke('tracking:listDeliveries', params),
    listReturns:     (params) => ipcRenderer.invoke('tracking:listReturns', params),
    markDelivered:   (params) => ipcRenderer.invoke('tracking:markDelivered', params),
    unmarkDelivered: (bId)    => ipcRenderer.invoke('tracking:unmarkDelivered', bId),
    markReturned:    (params) => ipcRenderer.invoke('tracking:markReturned', params),
    unmarkReturned:  (bId)    => ipcRenderer.invoke('tracking:unmarkReturned', bId),
    toggleItemReady: (params) => ipcRenderer.invoke('tracking:toggleItemReady', params),
    summary:         ()       => ipcRenderer.invoke('tracking:summary'),
  },

  // ─── Reports & Exports (Phase 10) ─────────────────────────────────────────
  reports: {
    get:              (params) => ipcRenderer.invoke('reports:get', params),
    generateHtml:     (params) => ipcRenderer.invoke('reports:generateHtml', params),
    exportExcel:      (params) => ipcRenderer.invoke('reports:exportExcel', params),
    exportPdf:        (params) => ipcRenderer.invoke('reports:exportPdf', params),
    print:            (params) => ipcRenderer.invoke('reports:print', params),
    exportEverything: (params) => ipcRenderer.invoke('reports:exportEverything', params),
    printDailyPack:   (params) => ipcRenderer.invoke('reports:printDailyPack', params),
  },

  // ─── Migration (Phase 11 MS Access) ───────────────────────────────────────
  migration: {
    browseFile: ()       => ipcRenderer.invoke('migration:browseFile'),
    preview:    (params) => ipcRenderer.invoke('migration:preview', params),
    run:        (params) => ipcRenderer.invoke('migration:run', params),
  },

  // ─── Sync (Phase 13 Supabase Cloud & Offline Sync) ────────────────────────
  sync: {
    status:          ()             => ipcRenderer.invoke('sync:status'),
    trigger:         ()             => ipcRenderer.invoke('sync:trigger'),
    setDeviceConfig: (config)       => ipcRenderer.invoke('sync:setDeviceConfig', config),
    resolveClash:    (bookingId)    => ipcRenderer.invoke('sync:resolveClash', bookingId),
  },
});



