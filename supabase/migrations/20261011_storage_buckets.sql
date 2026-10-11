-- ==============================================================================
-- IFRAH POS - Storage Buckets for Dress Photos & CNIC Scans
-- Private buckets requiring signed URLs / authenticated access
-- ==============================================================================

-- Create private buckets if they do not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('dress_photos', 'dress_photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('cnic_scans', 'cnic_scans', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

-- RLS policies on storage.objects
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('dress_photos', 'cnic_scans'));

CREATE POLICY "Authenticated users can read photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('dress_photos', 'cnic_scans'));
