-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Vendor Request Approval Workflow
-- Migration: 018_vendor_approval_workflow.sql
-- Purpose:
--   Allow Accounts Staff to submit new vendor requests for Admin approval.
--   Adds approval_status, approval_requested_by, approval_requested_at
--   to registry.entity_roles so a vendor created by an accounts user
--   sits in 'pending' state until an admin approves or rejects it.
--
-- Workflow:
--   1. Accounts Staff clicks "Request Vendor" in Master Data → Vendors.
--   2. Fills in vendor details → clicks "Submit for Approval".
--   3. Entity is inserted with is_active = FALSE.
--      entity_role is inserted with is_active = FALSE, approval_status = 'pending'.
--   4. Admin sees a "Pending Vendor Requests" banner in the Vendors tab.
--   5. Admin clicks Approve → entity + role become is_active = TRUE,
--      approval_status = 'approved'. Vendor is now live.
--   6. Admin clicks Reject → approval_status = 'rejected'. Entity stays inactive.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE registry.entity_roles
  ADD COLUMN IF NOT EXISTS approval_status        TEXT        DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approval_requested_by  TEXT,        -- display name of requesting user
  ADD COLUMN IF NOT EXISTS approval_requested_at  TIMESTAMPTZ; -- when the request was submitted

-- Index for fast admin lookups: "show me all pending vendor requests"
CREATE INDEX IF NOT EXISTS idx_entity_roles_approval_status
  ON registry.entity_roles (company_id, approval_status)
  WHERE approval_status = 'pending';
