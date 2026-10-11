/**
 * Ifrah POS — Layer 1 Code-Level Invisibility Engine
 * 
 * 1. Obfuscates sensitive JavaScript files (string encryption, control-flow flattening).
 * 2. Compiles obfuscated code to V8 Bytecode (.jsc) using Electron's exact V8 engine.
 * 3. Replaces .js files with minimal loader stubs for packaging.
 * 4. Supports clean restoration for development mode.
 */

const fs = require('fs');
const path = require('path');
const bytenode = require('bytenode');
const JavaScriptObfuscator = require('javascript-obfuscator');

const BACKUP_DIR = path.resolve(__dirname, '../.code_protection_backup');
const ELECTRON_DIR = path.resolve(__dirname, '../electron');

// Target sensitive modules to protect with V8 Bytecode & Heavy Obfuscation
const TARGET_FILES = [
  'auth/service.js',
  'auth/roles.js',
  'database/db.js',
  'database/schema.js',
  'bookings/service.js',
  'payments/service.js',
  'customers/service.js',
  'dresses/service.js',
  'receipts/service.js',
  'backup/service.js',
  'sync/service.js',
  'tracking/service.js',
  'reports/service.js',
  'search/service.js',
  'availability/service.js',
  'settings/service.js',
  'lists/service.js',
  'licensing/hwid.js',
  'licensing/validator.js',
  'licensing/activation.js',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function backupFile(relPath) {
  const src = path.join(ELECTRON_DIR, relPath);
  if (!fs.existsSync(src)) return;
  const dest = path.join(BACKUP_DIR, relPath);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function restoreFile(relPath) {
  const backup = path.join(BACKUP_DIR, relPath);
  const target = path.join(ELECTRON_DIR, relPath);
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, target);
  }
  const jscPath = target.replace(/\.js$/, '.jsc');
  if (fs.existsSync(jscPath)) {
    try { fs.unlinkSync(jscPath); } catch {}
  }
}

async function protectFile(relPath) {
  const filePath = path.join(ELECTRON_DIR, relPath);
  if (!fs.existsSync(filePath)) return;

  console.log(`[Protect] Obfuscating & Compiling: ${relPath}`);
  const originalCode = fs.readFileSync(filePath, 'utf8');

  // Step 1: Heavy Obfuscation (Mangle identifiers, encrypt string literals)
  const obfuscated = JavaScriptObfuscator.obfuscate(originalCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64', 'rc4'],
    stringArrayThreshold: 0.8,
    splitStrings: true,
    splitStringsChunkLength: 10,
    transformObjectKeys: true,
    deadCodeInjection: false,
  }).getObfuscatedCode();

  // Step 2: Compile to V8 Bytecode (.jsc) as CommonJS module
  const tempObfPath = filePath + '.temp.js';
  fs.writeFileSync(tempObfPath, obfuscated, 'utf8');

  const jscPath = filePath.replace(/\.js$/, '.jsc');
  await bytenode.compileFile({
    filename: tempObfPath,
    output: jscPath,
    compileAsModule: true
  });

  try { fs.unlinkSync(tempObfPath); } catch {}

  // Step 3: Replace .js with minimal bytenode loader stub
  const stubCode = `'use strict';
// Ifrah Collection POS — Bytecode Protected Module (V8 Binary)
require('bytenode');
const path = require('path');
module.exports = require(path.join(__dirname, '${path.basename(jscPath)}'));
`;
  fs.writeFileSync(filePath, stubCode, 'utf8');
}

async function protectAll() {
  console.log('=== [IFRAH SECURITY LAYER 1] Enabling V8 Bytecode & Obfuscation ===');
  ensureDir(BACKUP_DIR);
  for (const file of TARGET_FILES) {
    backupFile(file);
    await protectFile(file);
  }
  console.log('=== [IFRAH SECURITY LAYER 1] Protection Complete ===');
}

function restoreAll() {
  console.log('=== [IFRAH SECURITY LAYER 1] Restoring Original Source ===');
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('[Notice] No backup directory found.');
    return;
  }
  for (const file of TARGET_FILES) {
    restoreFile(file);
  }
  try {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  } catch {}
  console.log('=== [IFRAH SECURITY LAYER 1] Source Restored Cleanly ===');
}

const action = process.argv[2];
(async () => {
  if (action === '--restore') {
    restoreAll();
  } else if (action === '--protect') {
    await protectAll();
  } else {
    console.log('Usage: node scripts/protect-build.js [--protect | --restore]');
  }
})();
