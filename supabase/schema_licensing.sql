-- ==============================================================================
-- IFRAH POS — Cloud Licensing & Machine Binding Schema
-- Run this in your Supabase SQL Editor (1-time setup)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  machine_hwid TEXT,
  machine_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- 1-Time Secure Atomic Handshake RPC Function
CREATE OR REPLACE FUNCTION public.claim_license(
  p_license_key TEXT,
  p_hwid TEXT,
  p_machine_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lic RECORD;
BEGIN
  p_license_key := UPPER(TRIM(p_license_key));
  SELECT * INTO v_lic FROM public.licenses WHERE UPPER(license_key) = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'KEY_NOT_FOUND', 'message', 'License key darust nahi hai. Barah-e-karam dobara check karein.');
  END IF;

  IF v_lic.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'KEY_REVOKED', 'message', 'Ye license block / revoke kiya ja chuka hai. Admin se rabta karein.');
  END IF;

  IF v_lic.machine_hwid IS NOT NULL AND v_lic.machine_hwid <> p_hwid THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DEVICE_MISMATCH', 'message', 'Ye key pehle se kisi doosre computer par use ho chuki hai. Aik license sirf aik PC par chalta hai.');
  END IF;

  IF v_lic.machine_hwid = p_hwid THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACTIVE', 'client_name', v_lic.client_name, 'message', 'Machine pehle se registered hai.');
  END IF;

  UPDATE public.licenses
  SET machine_hwid = p_hwid, machine_code = p_machine_code, status = 'claimed', activated_at = now()
  WHERE id = v_lic.id;

  RETURN jsonb_build_object('ok', true, 'code', 'ACTIVATED', 'client_name', v_lic.client_name, 'message', 'License kamyabi se activate ho gaya hai.');
END;
$$;

-- Allow anonymous desktop app to call this function
GRANT EXECUTE ON FUNCTION public.claim_license(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- 10 PRODUCTION LICENSE KEYS — For Distribution
-- Ye keys apne clients ko deni hain
-- ============================================================
INSERT INTO public.licenses (license_key, client_name, notes) VALUES
  ('IFRAH-2026-A1B2-C3D4', 'Client 01 - Boutique 1',  'License #01 — Zainkh'),
  ('IFRAH-2026-E5F6-G7H8', 'Client 02 - Boutique 2',  'License #02 — Zainkh'),
  ('IFRAH-2026-I9J0-K1L2', 'Client 03 - Boutique 3',  'License #03 — Zainkh'),
  ('IFRAH-2026-M3N4-O5P6', 'Client 04 - Boutique 4',  'License #04 — Zainkh'),
  ('IFRAH-2026-Q7R8-S9T0', 'Client 05 - Boutique 5',  'License #05 — Zainkh'),
  ('IFRAH-2026-U1V2-W3X4', 'Client 06 - Boutique 6',  'License #06 — Zainkh'),
  ('IFRAH-2026-Y5Z6-A7B8', 'Client 07 - Boutique 7',  'License #07 — Zainkh'),
  ('IFRAH-2026-C9D0-E1F2', 'Client 08 - Boutique 8',  'License #08 — Zainkh'),
  ('IFRAH-2026-G3H4-I5J6', 'Client 09 - Boutique 9',  'License #09 — Zainkh'),
  ('IFRAH-2026-K7L8-M9N0', 'Client 10 - Boutique 10', 'License #10 — Zainkh')
ON CONFLICT (license_key) DO NOTHING;
