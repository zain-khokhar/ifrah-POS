'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMachineHwid, getFriendlyMachineCode } = require('./hwid');

// Cryptographic Secret Salt (obfuscated & compiled to V8 bytecode in production)
const LICENSE_HMAC_SALT = 'IFRAH_POS_2026_CORE_HMAC_OFFLINE_SECRET_786A_X99F';

let customLicPath = null;

function setCustomLicensePath(p) {
  customLicPath = p;
}

function getLicensePath(app) {
  if (customLicPath) return customLicPath;
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'license.lic');
  }
  // Fallback for tests or CLI
  return path.resolve(__dirname, '../../database/license.lic');
}

/**
 * Computes HMAC-SHA512 digital signature for the license payload
 */
function computeSignature(payload) {
  const data = `${payload.key}|${payload.clientName}|${payload.hwid}|${payload.issuedAt}`;
  return crypto.createHmac('sha512', LICENSE_HMAC_SALT).update(data).digest('hex');
}

/**
 * Creates and writes a cryptographically signed license file to disk
 */
function createLicenseFile(app, key, clientName = 'Ifrah Boutique') {
  const hwid = getMachineHwid();
  const machineCode = getFriendlyMachineCode();
  const issuedAt = new Date().toISOString();

  const payload = {
    key: String(key).trim().toUpperCase(),
    clientName: String(clientName).trim(),
    hwid,
    machineCode,
    issuedAt,
  };

  payload.signature = computeSignature(payload);

  const licPath = getLicensePath(app);
  const jsonContent = JSON.stringify(payload, null, 2);
  // Store Base64-encoded to prevent simple visual inspection
  const b64 = Buffer.from(jsonContent, 'utf8').toString('base64');

  fs.writeFileSync(licPath, b64, 'utf8');
  return { ok: true, payload };
}

/**
 * Anti-Piracy Poison Pill: Permanently destroys license and terminates runtime
 */
function triggerDissolve(app, reason = 'HARDWARE_MISMATCH') {
  console.error(`[SECURITY ALERT] Piracy / Tamper detected (${reason}). Executing dissolve kill-switch.`);

  const licPath = getLicensePath(app);
  try {
    if (fs.existsSync(licPath)) {
      // Overwrite with random zero/garbage bytes before deletion
      fs.writeFileSync(licPath, crypto.randomBytes(1024));
      fs.unlinkSync(licPath);
    }
  } catch {}

  // If in Electron runtime, kill immediately
  if (app && typeof app.exit === 'function') {
    app.exit(1);
  }
}

/**
 * Verifies the local license file 100% OFFLINE in 0.05 seconds
 */
function verifyLicense(app, options = { allowDissolve: true }) {
  const licPath = getLicensePath(app);

  if (!fs.existsSync(licPath)) {
    return {
      licensed: false,
      reason: 'NO_LICENSE',
      machineCode: getFriendlyMachineCode(),
    };
  }

  let payload;
  try {
    const raw = fs.readFileSync(licPath, 'utf8');
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    payload = JSON.parse(decoded);
  } catch {
    if (options.allowDissolve) triggerDissolve(app, 'CORRUPTED_FILE');
    return {
      licensed: false,
      reason: 'CORRUPTED_FILE',
      machineCode: getFriendlyMachineCode(),
    };
  }

  // 1. Verify Cryptographic HMAC Signature (Tamper check)
  const expectedSig = computeSignature(payload);
  if (payload.signature !== expectedSig) {
    if (options.allowDissolve) triggerDissolve(app, 'SIGNATURE_TAMPERED');
    return {
      licensed: false,
      reason: 'SIGNATURE_TAMPERED',
      machineCode: getFriendlyMachineCode(),
    };
  }

  // 2. Verify Hardware ID (Copied to another PC check)
  const currentHwid = getMachineHwid();
  if (payload.hwid !== currentHwid) {
    if (options.allowDissolve) triggerDissolve(app, 'HARDWARE_MISMATCH');
    return {
      licensed: false,
      reason: 'HARDWARE_MISMATCH',
      machineCode: getFriendlyMachineCode(),
    };
  }

  return {
    licensed: true,
    key: payload.key,
    clientName: payload.clientName,
    machineCode: payload.machineCode,
    issuedAt: payload.issuedAt,
  };
}

module.exports = {
  getLicensePath,
  setCustomLicensePath,
  computeSignature,
  createLicenseFile,
  verifyLicense,
  triggerDissolve,
};
