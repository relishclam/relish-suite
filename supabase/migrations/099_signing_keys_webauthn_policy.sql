-- ============================================================
-- RELISH SIGN — Allow users to update their own webauthn_credential_id
-- Migration: 099_signing_keys_webauthn_policy.sql
-- Fixes: "permission denied for table signing_keys" during passkey repair
-- ============================================================

-- Grant column-level UPDATE permission on the webauthn column
GRANT UPDATE (webauthn_credential_id)
  ON registry.signing_keys TO authenticated;

-- Allow a user to update their own signing key's webauthn_credential_id
CREATE POLICY "own key webauthn update" ON registry.signing_keys
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
