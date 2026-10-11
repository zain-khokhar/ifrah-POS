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
  -- Normalize key
  p_license_key := UPPER(TRIM(p_license_key));

  -- 1. Check if key exists
  SELECT * INTO v_lic FROM public.licenses WHERE UPPER(license_key) = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'KEY_NOT_FOUND',
      'message', 'License key darust nahi hai. Barah-e-karam dobara check karein.'
    );
  END IF;

  -- 2. Check if revoked/blocked by admin
  IF v_lic.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'KEY_REVOKED',
      'message', 'Ye license block / revoke kiya ja chuka hai. Admin se rabta karein.'
    );
  END IF;

  -- 3. Device Mismatch (Piracy / Copy attempt on 2nd PC)
  IF v_lic.machine_hwid IS NOT NULL AND v_lic.machine_hwid <> p_hwid THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DEVICE_MISMATCH',
      'message', 'Ye license key pehle se kisi doosre computer par use ho chuki hai. Aik license sirf aik PC par chalta hai.'
    );
  END IF;

  -- 4. Re-activation on the SAME machine (e.g. app re-installed)
  IF v_lic.machine_hwid = p_hwid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_ACTIVE',
      'client_name', v_lic.client_name,
      'message', 'Machine pehle se registered hai.'
    );
  END IF;

  -- 5. First-time successful binding
  UPDATE public.licenses
  SET
    machine_hwid = p_hwid,
    machine_code = p_machine_code,
    status = 'claimed',
    activated_at = now()
  WHERE id = v_lic.id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'ACTIVATED',
    'client_name', v_lic.client_name,
    'message', 'License kamyabi se activate ho gaya hai.'
  );
END;
$$;

-- Allow anonymous desktop app to call this function
GRANT EXECUTE ON FUNCTION public.claim_license(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Sample Seed License for Testing
INSERT INTO public.licenses (license_key, client_name, notes)
VALUES ('IFRAH-DEMO-2026-KEY', 'Ifrah Boutique Main Branch', 'Demo test key')
ON CONFLICT (license_key) DO NOTHING;
