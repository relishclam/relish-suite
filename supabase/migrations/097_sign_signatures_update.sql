-- ============================================================
-- RELISH SIGN — Allow signer to update seal asset paths
-- Migration: 097_sign_signatures_update.sql
-- Fixes: 403 Forbidden on PATCH to document_signatures
--        when background stamp writes seal_image_path / sealed_doc_path
-- ============================================================

-- Column-level grant: signer may only overwrite the two asset path columns
GRANT UPDATE (seal_image_path, sealed_doc_path)
  ON registry.document_signatures TO authenticated;

-- Row-level policy: signer may only update their own rows
CREATE POLICY "signer update seal paths" ON registry.document_signatures
  FOR UPDATE USING (signer_user_id = auth.uid());
