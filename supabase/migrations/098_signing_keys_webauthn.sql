-- ============================================================
-- RELISH SIGN — Add WebAuthn credential ID to signing_keys
-- Migration: 098_signing_keys_webauthn.sql
-- Apply BEFORE deploying Fix 006 (biometric gate)
-- ============================================================

ALTER TABLE registry.signing_keys
  ADD COLUMN IF NOT EXISTS webauthn_credential_id TEXT;
