/**
 * electron/auth/mailer.js
 *
 * Enterprise-grade multi-tier transactional email dispatcher for Ifrah POS.
 *
 * Architecture:
 * 1. Cloud Backend Service (Supabase Cloud Auth Recovery) - Zero configuration needed from shop owner.
 * 2. Enterprise Transactional API (Resend / SendGrid) - Platform-level automated dispatch.
 * 3. Corporate SMTP Relay - Optional enterprise domain relay (e.g. mail.company.com).
 * 4. Offline Resilience - Graceful handling when store has no internet or is offline.
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let _transporter = null;
let _envLoaded = false;

function loadEnv() {
  if (_envLoaded) return;
  _envLoaded = true;
  try {
    const envPath = path.resolve(__dirname, '../../.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}

function getTransporter() {
  loadEnv();
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return _transporter;
}

function renderEmailTemplate({ username, code }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #fdfdfd; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #7c3aed; margin: 0; font-size: 24px; letter-spacing: 0.5px;">Ifrah Collection POS</h1>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Dress Rental Management System • Security Service</p>
      </div>

      <div style="background: #ffffff; border: 1px solid #f1f5f9; padding: 22px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <p style="font-size: 15px; color: #0f172a; margin-top: 0; font-weight: 600;">
          Assalam-o-Alaikum ${username || 'Admin'},
        </p>
        <p style="font-size: 13.5px; color: #334155; line-height: 1.55;">
          Aap ke POS account ka password reset karne ke liye 6-digit verification code yeh hai:
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #7c3aed; background: #f5f3ff; border: 2px dashed #c4b5fd; padding: 12px 28px; border-radius: 8px; display: inline-block;">
            ${code}
          </span>
        </div>

        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
          Yeh code <strong>15 minute</strong> tak qabil-e-istemal hai. Agar aap ne password reset request nahi ki thi to is email ko nazar-andaz karein.
        </p>
      </div>

      <p style="text-align: center; font-size: 11px; color: #94a3b8; margin-top: 18px;">
        © Ifrah Collection POS • Automated Cloud Security Delivery
      </p>
    </div>
  `;
}

/**
 * Enterprise Send Password Reset Email.
 * Tries cloud providers in order:
 * 1. Resend API (if configured at SaaS platform level)
 * 2. Supabase Cloud Recovery API (built-in platform backend)
 * 3. Corporate SMTP (if configured for private enterprise domain)
 */
async function sendResetCodeEmail({ to, username, code }) {
  if (!to) {
    return { sent: false, reason: 'No recipient email specified.' };
  }

  loadEnv();

  // Tier 1: Platform Transactional API (Resend)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const from = process.env.RESEND_FROM || 'Ifrah POS Security <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `[Ifrah POS] Password Reset Verification Code: ${code}`,
          html: renderEmailTemplate({ username, code }),
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[Enterprise Mailer] Real email dispatched via Resend to ${to} (ID: ${data.id})`);
        return { sent: true, provider: 'resend', id: data.id };
      }
    } catch (err) {
      console.warn('[Enterprise Mailer] Resend API error:', err.message);
    }
  }

  // Tier 2: Cloud Backend Auth Recovery (Supabase Cloud)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: to }),
      });

      if (recoverRes.ok) {
        console.log(`[Enterprise Mailer] Cloud recovery email triggered via Supabase Cloud to ${to}`);
        return { sent: true, provider: 'supabase_cloud' };
      } else {
        const errData = await recoverRes.json().catch(() => ({}));
        console.warn(`[Enterprise Mailer] Supabase recovery response (${recoverRes.status}):`, errData.msg || recoverRes.statusText);
      }
    } catch (err) {
      console.warn('[Enterprise Mailer] Supabase recovery request failed:', err.message);
    }
  }

  // Tier 3: Corporate SMTP Relay (if company configured domain SMTP)
  const transporter = getTransporter();
  if (transporter) {
    try {
      const from = process.env.SMTP_FROM || `"Ifrah POS Security" <${process.env.SMTP_USER}>`;
      const info = await transporter.sendMail({
        from,
        to,
        subject: `[Ifrah POS] Password Reset Verification Code: ${code}`,
        text: `Assalam-o-Alaikum ${username},\n\nAap ka Ifrah POS password reset code: ${code} hai.\nYeh code 15 minute ke liye valid hai.`,
        html: renderEmailTemplate({ username, code }),
      });

      console.log(`[Enterprise Mailer] Real email sent via Corporate SMTP to ${to} (MessageId: ${info.messageId})`);
      return { sent: true, provider: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.warn(`[Enterprise Mailer] Corporate SMTP error to ${to}:`, err.message);
    }
  }

  // Fallback: Store is offline or cloud limits reached
  console.log(`[Enterprise Mailer] Store offline or cloud uncontacted. Local OTP for ${to}: ${code}`);
  return {
    sent: false,
    reason: 'CLOUD_OFFLINE_OR_UNREACHABLE',
    note: 'Cloud email service offline hai ya rate limit reach ho chuki hai.',
  };
}

module.exports = { sendResetCodeEmail };
