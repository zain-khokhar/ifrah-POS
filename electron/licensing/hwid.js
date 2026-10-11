'use strict';

const crypto = require('crypto');
const { execSync } = require('child_process');
const os = require('os');

let cachedHwid = null;
let cachedMachineCode = null;

function runPowerShell(cmd) {
  try {
    const stdout = execSync(`powershell -NoProfile -Command "${cmd}"`, {
      timeout: 3000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

function runWmic(cmd) {
  try {
    const stdout = execSync(cmd, {
      timeout: 3000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.length > 1 ? lines[1] : '';
  } catch {
    return '';
  }
}

/**
 * Extracts immutable hardware anchors from Windows machine
 */
function getHardwareAnchors() {
  if (process.platform !== 'win32') {
    // Non-Windows fallback (Linux/macOS development)
    const hostname = os.hostname();
    const cpus = os.cpus().map(c => c.model).join(',');
    return {
      motherboard: `DEV-MB-${hostname}`,
      cpu: `DEV-CPU-${cpus}`,
      bios: `DEV-BIOS-${hostname}`,
    };
  }

  // 1. Motherboard UUID
  let mbUuid = runPowerShell('(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID');
  if (!mbUuid || mbUuid.length < 5) {
    mbUuid = runWmic('wmic csproduct get uuid');
  }

  // 2. CPU Processor ID
  let cpuId = runPowerShell('(Get-CimInstance -ClassName Win32_Processor).ProcessorId');
  if (!cpuId || cpuId.length < 5) {
    cpuId = runWmic('wmic cpu get processorid');
  }

  // 3. BIOS Serial Number
  let biosSerial = runPowerShell('(Get-CimInstance -ClassName Win32_BIOS).SerialNumber');
  if (!biosSerial || biosSerial.length < 3) {
    biosSerial = runWmic('wmic bios get serialnumber');
  }

  // Extra fallback: OS machine name + network MAC if WMI completely blocked
  if (!mbUuid && !cpuId && !biosSerial) {
    mbUuid = os.hostname();
    cpuId = os.cpus()[0]?.model || 'UNKNOWN_CPU';
    biosSerial = os.platform() + os.arch();
  }

  return {
    motherboard: String(mbUuid || 'UNKNOWN_MB').trim().toUpperCase(),
    cpu: String(cpuId || 'UNKNOWN_CPU').trim().toUpperCase(),
    bios: String(biosSerial || 'UNKNOWN_BIOS').trim().toUpperCase(),
  };
}

/**
 * Returns a 64-character SHA-256 Machine Hardware Fingerprint
 */
function getMachineHwid() {
  if (cachedHwid) return cachedHwid;

  const anchors = getHardwareAnchors();
  const rawSignature = `IFRAH_V1|MB:${anchors.motherboard}|CPU:${anchors.cpu}|BIOS:${anchors.bios}`;

  cachedHwid = crypto.createHash('sha256').update(rawSignature).digest('hex');
  return cachedHwid;
}

/**
 * Returns a friendly 16-character Machine Code for client display:
 * e.g. "IFRAH-849E-BFEB-5CG1-C5F8"
 */
function getFriendlyMachineCode() {
  if (cachedMachineCode) return cachedMachineCode;

  const hwid = getMachineHwid();
  const c1 = hwid.slice(0, 4).toUpperCase();
  const c2 = hwid.slice(8, 12).toUpperCase();
  const c3 = hwid.slice(16, 20).toUpperCase();
  const c4 = hwid.slice(24, 28).toUpperCase();

  cachedMachineCode = `IFRAH-${c1}-${c2}-${c3}-${c4}`;
  return cachedMachineCode;
}

module.exports = {
  getMachineHwid,
  getFriendlyMachineCode,
  getHardwareAnchors,
};
