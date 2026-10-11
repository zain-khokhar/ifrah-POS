'use strict';

const fs = require('fs');
const path = require('path');
const { getMachineHwid, getFriendlyMachineCode } = require('./hwid');
const { createLicenseFile } = require('./validator');

const DEFAULT_SUPABASE_URL = 'https://mumaiqbmpbobsaxewhta.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_zbk1eUYD021pqb219tHQ7Q_914lHuIc';

function getSupabaseCredentials() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    try {
      const envPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
            url = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
          } else if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=')) {
            key = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
          }
        }
      }
    } catch {}
  }

  return {
    url: url || DEFAULT_SUPABASE_URL,
    key: key || DEFAULT_SUPABASE_ANON_KEY,
  };
}

/**
 * 1-Time Supabase Cloud Activation
 * Connects once to Supabase, binds HWID, and generates offline .lic file
 */
async function activateOnline(app, rawKey, customClient = null) {
  const licenseKey = String(rawKey || '').trim().toUpperCase();
  if (!licenseKey || licenseKey.length < 5) {
    return { ok: false, code: 'INVALID_FORMAT', message: 'Barah-e-karam durust License Key enter karein.' };
  }

  const hwid = getMachineHwid();
  const machineCode = getFriendlyMachineCode();

  // If a mock client is provided (for unit tests)
  if (customClient && typeof customClient.claim === 'function') {
    const res = await customClient.claim({ licenseKey, hwid, machineCode });
    if (!res.ok) return res;
    createLicenseFile(app, licenseKey, res.client_name || 'Ifrah Boutique');
    return { ok: true, clientName: res.client_name, message: res.message };
  }

  const { url, key } = getSupabaseCredentials();
  if (!url || !key) {
    return {
      ok: false,
      code: 'CONFIG_MISSING',
      message: 'Supabase credentials mojood nahi hain. Barah-e-karam internet aur config check karein.',
    };
  }

  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/claim_license`;

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        p_license_key: licenseKey,
        p_hwid: hwid,
        p_machine_code: machineCode,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    console.error('[Activation Fetch Error]', err);
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Internet se rabta nahi ho saka. Pehli dafa activation ke liye 5 second internet darkaar hai.',
    };
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('[Activation RPC Error]', response.status, errText);
    return {
      ok: false,
      code: 'SERVER_ERROR',
      message: 'License server se rabta nahi ho saka ya RPC mojood nahi hai.',
    };
  }

  const data = await response.json();
  if (!data || data.ok === false) {
    return {
      ok: false,
      code: data?.code || 'ACTIVATION_REJECTED',
      message: data?.message || 'License key activate nahi ho saki.',
    };
  }

  // Success! Write cryptographic offline license file to disk
  const clientName = data.client_name || 'Ifrah Boutique Client';
  createLicenseFile(app, licenseKey, clientName);

  return {
    ok: true,
    code: data.code || 'ACTIVATED',
    clientName,
    message: data.message || 'Software kamyabi se activate ho gaya hai.',
  };
}

module.exports = {
  activateOnline,
  getSupabaseCredentials,
};
