'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMachineHwid, getFriendlyMachineCode } = require('./hwid');

const LICENSE_HMAC_SALT = 'IFRAH_POS_2026_CORE_HMAC_OFFLINE_SECRET_786A_X99F';

let customLicPath = null;
let _cachedPayload = null;
let _lastDiskCheck = 0;
const DISK_CHECK_INTERVAL_MS = 5000;

function setCustomLicensePath(p) {
  customLicPath = p;
  _cachedPayload = null;
  _lastDiskCheck = 0;
}

function getLicensePath(app) {
  if (customLicPath) return customLicPath;
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'license.lic');
  }
  return path.resolve(__dirname, '../../database/license.lic');
}

function computeSignature(payload) {
  const data = `${payload.key}|${payload.clientName}|${payload.hwid}|${payload.issuedAt}`;
  return crypto.createHmac('sha512', LICENSE_HMAC_SALT).update(data).digest('hex');
}

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
  const dir = path.dirname(licPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const b64 = Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64');
  fs.writeFileSync(licPath, b64, 'utf8');
  _cachedPayload = payload;
  _lastDiskCheck = Date.now();
  return { ok: true, payload };
}

function triggerDissolve(app, reason = 'HARDWARE_MISMATCH') {
  console.error(`[SECURITY] Piracy detected (${reason}). Dissolving license.`);
  _cachedPayload = null;
  const licPath = getLicensePath(app);
  try {
    if (fs.existsSync(licPath)) {
      fs.writeFileSync(licPath, crypto.randomBytes(1024));
      fs.unlinkSync(licPath);
    }
  } catch {}
  if (app && typeof app.exit === 'function') app.exit(1);
}

function verifyLicense(app, options = { allowDissolve: true }) {
  const licPath = getLicensePath(app);
  if (!fs.existsSync(licPath)) {
    return { licensed: false, reason: 'NO_LICENSE', machineCode: getFriendlyMachineCode() };
  }
  let payload;
  try {
    const raw = fs.readFileSync(licPath, 'utf8');
    payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    if (options.allowDissolve) triggerDissolve(app, 'CORRUPTED_FILE');
    return { licensed: false, reason: 'CORRUPTED_FILE', machineCode: getFriendlyMachineCode() };
  }
  if (payload.signature !== computeSignature(payload)) {
    if (options.allowDissolve) triggerDissolve(app, 'SIGNATURE_TAMPERED');
    return { licensed: false, reason: 'SIGNATURE_TAMPERED', machineCode: getFriendlyMachineCode() };
  }
  if (payload.hwid !== getMachineHwid()) {
    if (options.allowDissolve) triggerDissolve(app, 'HARDWARE_MISMATCH');
    return { licensed: false, reason: 'HARDWARE_MISMATCH', machineCode: getFriendlyMachineCode() };
  }
  _cachedPayload = payload;
  _lastDiskCheck = Date.now();
  return {
    licensed: true,
    key: payload.key,
    clientName: payload.clientName,
    machineCode: payload.machineCode,
    issuedAt: payload.issuedAt,
  };
}

function assertLicenseValid(app) {
  const now = Date.now();
  if (!_cachedPayload || (now - _lastDiskCheck > DISK_CHECK_INTERVAL_MS)) {
    const result = verifyLicense(app, { allowDissolve: true });
    if (!result.licensed) throw new Error(`LICENSE_INVALID:${result.reason}`);
    return true;
  }
  if (_cachedPayload.hwid !== getMachineHwid()) {
    triggerDissolve(app, 'HARDWARE_MISMATCH');
    throw new Error('LICENSE_INVALID:HARDWARE_MISMATCH');
  }
  if (computeSignature(_cachedPayload) !== _cachedPayload.signature) {
    triggerDissolve(app, 'SIGNATURE_TAMPERED');
    throw new Error('LICENSE_INVALID:SIGNATURE_TAMPERED');
  }
  return true;
}

module.exports = {
  getLicensePath,
  setCustomLicensePath,
  computeSignature,
  createLicenseFile,
  verifyLicense,
  assertLicenseValid,
  triggerDissolve,
};
