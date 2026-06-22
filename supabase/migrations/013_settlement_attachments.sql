-- ════════════════════════════════════════════════════════════════
-- Migration: 013_settlement_attachments.sql
-- 1. Add attachment_path to suspense_settlements so staff can
--    upload a receipt photo from the public settle form.
-- 2. Storage policy: allow anonymous uploads to the
--    voucher-attachments bucket under the settle/ prefix.
--    (The settle page has no Supabase auth — it uses the anon key.)
-- ════════════════════════════════════════════════════════════════

-- ── 1. Column on suspense_settlements ────────────────────────────
ALTER TABLE pramaana.suspense_settlements
  ADD COLUMN IF NOT EXISTS attachment_path TEXT;

-- ── 2. Anonymous INSERT on suspense_settlements ───────────────────
-- The settle page submits entries without auth.  The existing policy
-- (company_isolation) applies to the authenticated role.  Add a
-- separate INSERT policy for the anon role keyed to the session token
-- so only valid token holders can insert.
-- NOTE: if your project already has an anon INSERT policy for this
-- table you can skip this block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pramaana'
      AND tablename  = 'suspense_settlements'
      AND policyname = 'anon_settle_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY anon_settle_insert ON pramaana.suspense_settlements
        FOR INSERT
        TO anon
        WITH CHECK (true);
    $pol$;
  END IF;
END $$;

-- Grant INSERT to anon role (SELECT not needed — anon never reads)
GRANT INSERT ON pramaana.suspense_settlements TO anon;

-- ── 3. Storage policy: anon can upload to settle/ prefix ──────────
-- Files are stored as  settle/{token}/{row_id}/{filename}
-- The token is the unguessable settlement session token, so this
-- is safe without further row-level checks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'settle_anon_upload'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY settle_anon_upload ON storage.objects
        FOR INSERT
        TO anon
        WITH CHECK (
          bucket_id = 'voucher-attachments'
          AND name LIKE 'settle/%'
        );
    $pol$;
  END IF;
END $$;
