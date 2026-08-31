-- ============================================================
-- RELISH SIGN — Storage bucket RLS policies
-- Migration: 096_sign_storage_policies.sql
-- Fixes: 400 "new row violates row-level security policy"
--        when uploading to relish-sign-docs bucket
-- ============================================================

-- Allow any authenticated user to upload files
CREATE POLICY "relish-sign-docs upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'relish-sign-docs');

-- Allow any authenticated user to read files (private bucket — no public access)
CREATE POLICY "relish-sign-docs read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'relish-sign-docs');

-- Allow authenticated users to update (needed for seal path backfill)
CREATE POLICY "relish-sign-docs update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'relish-sign-docs');
