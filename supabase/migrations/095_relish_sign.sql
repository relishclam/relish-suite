-- ============================================================
-- RELISH SIGN — Digital Signature Infrastructure
-- Migration: 095_relish_sign.sql
-- Schema: registry (project mmkbknnzgpvsqgnynrbe)
-- ============================================================

-- ============================================================
-- SIGNING KEYS — one row per enrolled device per user
-- ============================================================
CREATE TABLE registry.signing_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,           -- "Motty's iPhone 15"
  public_key_jwk  JSONB NOT NULL,          -- exported public key (JWK format)
  algorithm       TEXT NOT NULL DEFAULT 'ECDSA-P256',
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,             -- NULL = active
  revoked_by      UUID REFERENCES auth.users(id),
  revoke_reason   TEXT
);

CREATE INDEX idx_signing_keys_user ON registry.signing_keys(user_id)
  WHERE revoked_at IS NULL;

-- ============================================================
-- SIGNING REQUESTS — one row per QR signing session
-- ============================================================
CREATE TABLE registry.signing_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signer_user_id   UUID NOT NULL REFERENCES auth.users(id),
  requested_by     UUID NOT NULL REFERENCES auth.users(id),
  document_path    TEXT NOT NULL,
  document_hash    TEXT NOT NULL,          -- SHA-256 hex of file bytes
  document_name    TEXT NOT NULL,
  document_type    TEXT NOT NULL
                     CHECK (document_type IN ('pdf','image','generated')),
  source_app       TEXT NOT NULL
                     CHECK (source_app IN ('pramaana','suite','clamflow','approvals','relish-sign')),
  source_record_id TEXT,                   -- voucher_id, po_id, etc. (nullable for quick-sign)
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','signed','rejected','expired')),
  signature_bytes  TEXT,                   -- base64 ECDSA signature (populated on sign)
  signing_key_id   UUID REFERENCES registry.signing_keys(id),
  signed_at        TIMESTAMPTZ,
  rejected_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signing_requests_signer
  ON registry.signing_requests(signer_user_id, status);
CREATE INDEX idx_signing_requests_expires
  ON registry.signing_requests(expires_at) WHERE status = 'pending';

-- ============================================================
-- DOCUMENT SIGNATURES — permanent audit record
-- ============================================================
CREATE TABLE registry.document_signatures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (snapshot at time of signing — immutable)
  signer_user_id   UUID NOT NULL REFERENCES auth.users(id),
  signing_key_id   UUID NOT NULL REFERENCES registry.signing_keys(id),
  signer_name      TEXT NOT NULL,          -- snapshot: "Motty Philip"

  -- Document
  document_path    TEXT NOT NULL,
  document_hash    TEXT NOT NULL,
  document_name    TEXT NOT NULL,
  document_type    TEXT NOT NULL,
  source_app       TEXT NOT NULL,
  source_record_id TEXT,

  -- Cryptographic proof
  signature_bytes  TEXT NOT NULL,
  algorithm        TEXT NOT NULL DEFAULT 'ECDSA-P256',

  -- Seal identity
  seal_sequence    BIGSERIAL,
  seal_id          TEXT UNIQUE,            -- 'RSG-0047 · a3f7c92d' (set by trigger)
  seal_image_path  TEXT,                   -- Storage path of rendered seal PNG
  sealed_doc_path  TEXT,                   -- Storage path of stamped PDF/image

  -- Provenance
  signed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id       UUID REFERENCES registry.signing_requests(id)
);

-- Trigger: auto-generate seal_id from sequence + document hash prefix
CREATE OR REPLACE FUNCTION registry.fn_set_seal_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.seal_id := 'RSG-' || LPAD(NEW.seal_sequence::TEXT, 4, '0')
                 || ' · ' || LEFT(NEW.document_hash, 8);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_seal_id
  BEFORE INSERT ON registry.document_signatures
  FOR EACH ROW EXECUTE FUNCTION registry.fn_set_seal_id();

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE registry.signing_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.signing_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.document_signatures ENABLE ROW LEVEL SECURITY;

-- signing_keys: enroll only if Relish Group member
CREATE POLICY "enroll only if company member" ON registry.signing_keys
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid()
      AND company_id IN (
        'bc455c94-0bcd-4d66-a040-d29ed880d22f',  -- RFPL
        'b8beb440-df7f-48e8-a012-ac5750502eca'   -- RHHF
      )
    )
  );

CREATE POLICY "own keys read" ON registry.signing_keys
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin keys read" ON registry.signing_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

CREATE POLICY "admin revoke" ON registry.signing_keys
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- signing_requests: signer or requester only
CREATE POLICY "signer or requester" ON registry.signing_requests
  FOR ALL USING (signer_user_id = auth.uid() OR requested_by = auth.uid());

-- document_signatures: any Relish company member may read; signer inserts
CREATE POLICY "authenticated read" ON registry.document_signatures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM registry.company_users WHERE user_id = auth.uid())
  );

CREATE POLICY "signer insert" ON registry.document_signatures
  FOR INSERT WITH CHECK (signer_user_id = auth.uid());

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT ON registry.signing_keys        TO authenticated;
GRANT UPDATE (revoked_at, revoked_by, revoke_reason, last_used_at)
                        ON registry.signing_keys        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON registry.signing_requests  TO authenticated;
GRANT SELECT, INSERT ON registry.document_signatures   TO authenticated;
GRANT USAGE, SELECT  ON SEQUENCE registry.document_signatures_seal_sequence_seq TO authenticated;
