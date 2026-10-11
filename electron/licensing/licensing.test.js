const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getMachineHwid, getFriendlyMachineCode, getHardwareAnchors } = require('./hwid');
const {
  setCustomLicensePath,
  createLicenseFile,
  verifyLicense,
  computeSignature,
} = require('./validator');
const { activateOnline } = require('./activation');

const TEST_LIC_PATH = path.resolve(__dirname, 'test_sandbox.lic');

test('Licensing Security Suite', async (t) => {
  t.beforeEach(() => {
    setCustomLicensePath(TEST_LIC_PATH);
    if (fs.existsSync(TEST_LIC_PATH)) fs.unlinkSync(TEST_LIC_PATH);
  });

  t.afterEach(() => {
    if (fs.existsSync(TEST_LIC_PATH)) fs.unlinkSync(TEST_LIC_PATH);
    setCustomLicensePath(null);
  });

  await t.test('1. Hardware Fingerprinting (HWID)', () => {
    const anchors = getHardwareAnchors();
    assert.ok(anchors.motherboard && anchors.motherboard.length > 2, 'Motherboard anchor should be extracted');
    assert.ok(anchors.cpu && anchors.cpu.length > 2, 'CPU anchor should be extracted');

    const hwid = getMachineHwid();
    assert.equal(typeof hwid, 'string');
    assert.equal(hwid.length, 64, 'HWID must be 64-character SHA-256 hex string');

    const code = getFriendlyMachineCode();
    assert.ok(code.startsWith('IFRAH-'), 'Machine code must start with IFRAH-');
    assert.equal(code.split('-').length, 5, 'Machine code should have 5 dash-separated chunks');
  });

  await t.test('2. Unactivated Machine Check', () => {
    const status = verifyLicense(null, { allowDissolve: false });
    assert.equal(status.licensed, false);
    assert.equal(status.reason, 'NO_LICENSE');
    assert.ok(status.machineCode);
  });

  await t.test('3. Local License Creation & Offline Validation', () => {
    const createRes = createLicenseFile(null, 'IFRAH-TEST-2026', 'Al-Haram Bridal');
    assert.equal(createRes.ok, true);
    assert.ok(fs.existsSync(TEST_LIC_PATH), 'License file should exist on disk');

    const verifyRes = verifyLicense(null, { allowDissolve: false });
    assert.equal(verifyRes.licensed, true);
    assert.equal(verifyRes.key, 'IFRAH-TEST-2026');
    assert.equal(verifyRes.clientName, 'Al-Haram Bridal');
  });

  await t.test('4. Anti-Tamper: Signature Invalidation on Altered Content', () => {
    createLicenseFile(null, 'IFRAH-TEST-2026', 'Original Name');

    // Read and alter content
    const raw = Buffer.from(fs.readFileSync(TEST_LIC_PATH, 'utf8'), 'base64').toString('utf8');
    const altered = raw.replace('Original Name', 'Hacker Fake Name');
    fs.writeFileSync(TEST_LIC_PATH, Buffer.from(altered, 'utf8').toString('base64'));

    const status = verifyLicense(null, { allowDissolve: false });
    assert.equal(status.licensed, false);
    assert.equal(status.reason, 'SIGNATURE_TAMPERED');
  });

  await t.test('5. Anti-Piracy: Hardware Mismatch on Copied Installation', () => {
    // Simulate license created for another computer with a different HWID
    const fakePayload = {
      key: 'IFRAH-PIRATED-KEY',
      clientName: 'Pirate Shop',
      hwid: '9999999999999999999999999999999999999999999999999999999999999999',
      machineCode: 'IFRAH-9999-8888-7777-6666',
      issuedAt: new Date().toISOString(),
    };
    fakePayload.signature = computeSignature(fakePayload);
    fs.writeFileSync(TEST_LIC_PATH, Buffer.from(JSON.stringify(fakePayload), 'utf8').toString('base64'));

    const status = verifyLicense(null, { allowDissolve: false });
    assert.equal(status.licensed, false);
    assert.equal(status.reason, 'HARDWARE_MISMATCH');
  });

  await t.test('6. 1-Time Supabase Cloud Activation Handshake', async () => {
    let claimedPayload = null;
    const mockClient = {
      claim: async (params) => {
        claimedPayload = params;
        return {
          ok: true,
          client_name: 'Gulshan Branch',
          message: 'Activated successfully',
        };
      },
    };

    const res = await activateOnline(null, 'IFRAH-NEW-KEY', mockClient);
    assert.equal(res.ok, true);
    assert.equal(res.clientName, 'Gulshan Branch');
    assert.equal(claimedPayload.licenseKey, 'IFRAH-NEW-KEY');
    assert.ok(claimedPayload.hwid, 'HWID should be sent to cloud');

    // After online handshake, offline verification succeeds immediately
    const verifyRes = verifyLicense(null, { allowDissolve: false });
    assert.equal(verifyRes.licensed, true);
    assert.equal(verifyRes.clientName, 'Gulshan Branch');
  });

  await t.test('7. Cloud Rejection on Device Mismatch (Already Used Key)', async () => {
    const mockRejectClient = {
      claim: async () => ({
        ok: false,
        code: 'DEVICE_MISMATCH',
        message: 'Ye license key pehle se kisi aur computer par use ho chuki hai.',
      }),
    };

    const res = await activateOnline(null, 'IFRAH-DUPLICATE-KEY', mockRejectClient);
    assert.equal(res.ok, false);
    assert.equal(res.code, 'DEVICE_MISMATCH');
    assert.ok(res.message.includes('pehle se kisi aur computer'));
  });
});
