import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SlideOver from '../components/common/SlideOver';
import { fetchProfiles, fetchAllCompanyUsers, updateProfile, fetchUserCompanies, assignUserCompany, removeUserCompany, inviteUser, setUserDefaultPassword, updateCompanyUserRole, setAuditEditMode } from '../lib/profiles';
import { fetchCompanies } from '../lib/companies';
import { writeAuditLog } from '../lib/auditLog';

// Roles assignable to a company_users row.
// Super Admin is a profile-level flag (is_super_admin), not a company role.
const COMPANY_ROLES = [
  { value: 'admin',    label: 'Admin'    },
  { value: 'accounts', label: 'Accounts' },
  { value: 'auditor',  label: 'Auditor'  },
];

export default function UserManagement() {
  const { activeRole } = useAuth();
  // Both super_admin (platform flag) and company admin can manage users
  const canManageUsers = activeRole === 'super_admin' || activeRole === 'admin';
  const addToast = useToast();

  const [users, setUsers] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Slide-over
  const [slideOpen, setSlideOpen] = useState(false);
  const [slideMode, setSlideMode] = useState('edit'); // 'edit' | 'invite'
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Company assignments for selected user
  const [userComps,    setUserComps]    = useState([]);
  const [compLoading,  setCompLoading]  = useState(false);

  // Company assignment add-row
  const [assignCompId,  setAssignCompId]  = useState('');
  const [assignRole,    setAssignRole]    = useState('accounts');

  // Invite
  const [inviteEmail,    setInviteEmail]    = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteCompanyId, setInviteCompanyId] = useState('');
  const [inviteRole,     setInviteRole]     = useState('accounts');
  const [defaultPassword, setDefaultPassword] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesData, companiesData, allCuData] = await Promise.all([
        fetchProfiles(), fetchCompanies(), fetchAllCompanyUsers(),
      ]);
      // Group company_users rows by user_id so we can show roles in the list
      const cuByUser = {};
      allCuData.forEach((cu) => {
        if (!cuByUser[cu.user_id]) cuByUser[cu.user_id] = [];
        cuByUser[cu.user_id].push(cu);
      });
      setUsers(profilesData.map((p) => ({ ...p, companyRoles: cuByUser[p.id] ?? [] })));
      setAllCompanies(companiesData);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter users ──
  const filtered = users.filter((u) => {
    if (!showInactive && !u.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ── Open edit ──
  // Open edit: also reset invite fields
  const openEdit = async (user) => {
    setSlideMode('edit');
    setSelectedUser(user);
    setForm({ full_name: user.full_name || '', is_active: user.is_active });
    setDefaultPassword('');
    setSlideOpen(true);
    setCompLoading(true);
    try {
      setUserComps(await fetchUserCompanies(user.id));
    } catch (err) {
      addToast('Failed to load company assignments', 'error');
    } finally {
      setCompLoading(false);
    }
  };

  // ── Open invite ──
  const openInvite = () => {
    setSlideMode('invite');
    setSelectedUser(null);
    setInviteEmail('');
    setInviteFullName('');
    setInviteCompanyId('');
    setInviteRole('accounts');
    setSlideOpen(true);
  };

  const closeSlide = () => {
    setSlideOpen(false);
    setSelectedUser(null);
    setUserComps([]);
    setAssignCompId('');
    setAssignRole('accounts');
    setInviteEmail('');
    setInviteFullName('');
    setInviteCompanyId('');
    setInviteRole('accounts');
    setDefaultPassword('');
  };

  // ── Save profile ──
  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await updateProfile(selectedUser.id, {
        full_name: form.full_name,
        is_active: form.is_active,
      });
      writeAuditLog({ action: 'update', tableName: 'profiles', recordId: selectedUser.id });
      addToast('User updated', 'success');
      closeSlide();
      loadData();
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Set a temporary password for an existing user ──
  const handleSetPassword = async () => {
    if (!selectedUser || !defaultPassword.trim()) return;
    setSaving(true);
    try {
      await setUserDefaultPassword(selectedUser.id, defaultPassword.trim(), selectedUser.email, form.full_name || selectedUser.full_name || '');
      writeAuditLog({ action: 'set_password', tableName: 'profiles', recordId: selectedUser.id });
      addToast('Password updated', 'success');
      setDefaultPassword('');
    } catch (err) {
      addToast('Password update failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Deactivate / Activate ──
  const handleToggleActive = async () => {
    if (!selectedUser) return;
    const newState = !selectedUser.is_active;
    try {
      await updateProfile(selectedUser.id, { is_active: newState });
      writeAuditLog({ action: newState ? 'activate' : 'deactivate', tableName: 'profiles', recordId: selectedUser.id });
      addToast(newState ? 'User activated' : 'User deactivated', 'success');
      closeSlide();
      loadData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // ── Assign company ──
  const handleAssign = async () => {
    if (!selectedUser || !assignCompId) return;
    try {
      await assignUserCompany(selectedUser.id, assignCompId, assignRole);
      writeAuditLog({ action: 'assign_company', tableName: 'user_companies', recordId: selectedUser.id });
      addToast('Company assigned', 'success');
      setAssignCompId('');
      setAssignRole('accounts');
      setUserComps(await fetchUserCompanies(selectedUser.id));
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // ── Update role on an existing company assignment ──
  const handleUpdateCompanyRole = async (companyUserId, role) => {
    try {
      await updateCompanyUserRole(companyUserId, role);
      setUserComps((prev) => prev.map((uc) => uc.id === companyUserId ? { ...uc, role } : uc));
    } catch (err) {
      addToast('Role update failed: ' + err.message, 'error');
    }
  };

  // ── Toggle audit-edit mode for an auditor ──
  const handleToggleAuditEdit = async (companyUserId, enabled) => {
    try {
      await setAuditEditMode(companyUserId, enabled);
      setUserComps((prev) => prev.map((uc) => uc.id === companyUserId ? { ...uc, audit_edit_enabled: enabled } : uc));
      addToast(enabled ? 'Audit edit enabled' : 'Audit edit disabled', 'success');
    } catch (err) {
      addToast('Failed: ' + err.message, 'error');
    }
  };

  // ── Remove company ──
  const handleRemoveComp = async (ucId) => {
    try {
      await removeUserCompany(ucId);
      writeAuditLog({ action: 'remove_company', tableName: 'user_companies', recordId: ucId });
      addToast('Company removed', 'success');
      setUserComps(await fetchUserCompanies(selectedUser.id));
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // ── Invite user ──
  const handleInvite = async () => {
    if (!inviteEmail || !inviteFullName || !inviteCompanyId || !inviteRole) return;
    setSaving(true);
    try {
      await inviteUser(inviteEmail.trim().toLowerCase(), inviteFullName.trim(), inviteCompanyId, inviteRole);
      writeAuditLog({ action: 'invite', tableName: 'profiles' });
      addToast(`Invite sent to ${inviteEmail}`, 'success');
      closeSlide();
      loadData();
    } catch (err) {
      addToast('Invite failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Available companies to assign (not already assigned)
  const assignedIds = new Set(userComps.map((uc) => uc.company_id));
  const availableCompanies = allCompanies.filter((c) => !assignedIds.has(c.id));

  if (!canManageUsers) {
    return (
      <div className="um-page">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p className="text-muted">User management requires Admin or Super Admin role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="um-page">
      <div className="um-page__header">
        <h1 className="um-page__title">User Management</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={openInvite}>+ Invite User</button>
      </div>

      {/* Filter bar */}
      <div className="md-filter-bar">
        <input className="form-input md-filter-bar__search" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="md-filter-bar__toggle">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        <span className="text-muted" style={{ fontSize: '0.8125rem' }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Users table */}
      {loading ? <LoadingSpinner /> : (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform Role</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '2rem' }}>No users found</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="md-table__row" onClick={() => openEdit(u)}>
                  <td><strong>{u.full_name || '—'}</strong><br /><span className="text-muted" style={{ fontSize: '0.75rem' }}>{u.email || ''}</span></td>
                  <td>
                    {u.is_super_admin ? (
                      <span className="badge badge--navy">Super Admin</span>
                    ) : u.companyRoles?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {u.companyRoles.map((cr) => (
                          <span key={cr.id} style={{ fontSize: '0.75rem' }}>
                            <span className="text-muted">{cr.company?.short_name ?? '—'}:</span>{' '}
                            <strong style={{ textTransform: 'capitalize' }}>{cr.role}</strong>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>No role assigned</span>
                    )}
                  </td>
                  <td><span className={`badge badge--${u.is_active ? 'success' : 'muted'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ fontSize: '0.75rem' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over */}
      <SlideOver open={slideOpen} onClose={closeSlide} title={slideMode === 'invite' ? 'Invite User' : 'Edit User'}>

        {/* ─── Invite form ─── */}
        {slideMode === 'invite' && (
          <div className="md-slide-form">
            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
              An invite email will be sent. The user sets their password on first login.
            </p>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Arun Kumar" value={inviteFullName} onChange={(e) => setInviteFullName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input className="form-input" type="email" placeholder="user@relishfoods.in" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Company *</label>
              <select className="form-input" value={inviteCompanyId} onChange={(e) => setInviteCompanyId(e.target.value)}>
                <option value="">Select company…</option>
                {allCompanies.map((c) => <option key={c.id} value={c.id}>{c.short_name} — {c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Role *</label>
              <select className="form-input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {COMPANY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving || !inviteEmail || !inviteFullName || !inviteCompanyId} onClick={handleInvite}>{saving ? 'Sending…' : 'Send Invite'}</button>
              <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
            </div>
          </div>
        )}

        {/* ─── Edit form ─── */}
        {slideMode === 'edit' && selectedUser && (
          <div className="md-slide-form">
            {/* Profile fields */}
            <div className="um-section">
              <h3 className="um-section__title">Profile</h3>
              <div className="po-form__grid">
                <div className="form-group">
                  <label className="form-label">User ID</label>
                  <input className="form-input" value={selectedUser.id} readOnly />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={selectedUser.email || ''} readOnly />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" value={form.full_name || ''} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Password reset */}
            <div className="um-section">
              <h3 className="um-section__title">Temporary Password</h3>
              <div className="form-group">
                <label className="form-label">Default password</label>
                <input className="form-input" type="password" value={defaultPassword} onChange={(e) => setDefaultPassword(e.target.value)} placeholder="Set a temporary password for this user" />
              </div>
              <div className="md-slide-form__actions" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving || !defaultPassword.trim()} onClick={handleSetPassword}>{saving ? 'Updating…' : 'Set Password'}</button>
              </div>
            </div>

            {/* Company assignments */}
            <div className="um-section">
              <h3 className="um-section__title">Company Access</h3>
              {compLoading ? <LoadingSpinner /> : (
                <>
                  {userComps.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.8125rem' }}>No companies assigned yet.</p>
                  ) : (
                    <div className="um-company-list">
                      {userComps.map((uc) => (
                        <div key={uc.id} className="um-company-list__item">
                          <span className="um-company-list__name">
                            {uc.company?.short_name || uc.company_id} — {uc.company?.name || ''}
                          </span>
                          <select
                            className="form-input form-input--sm"
                            value={uc.role}
                            onChange={(e) => handleUpdateCompanyRole(uc.id, e.target.value)}
                          >
                            {COMPANY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          {uc.role === 'auditor' && (
                            <label className="um-audit-toggle" title="Allow auditor to rename ledgers and move vouchers during audit">
                              <input
                                type="checkbox"
                                checked={!!uc.audit_edit_enabled}
                                onChange={(e) => handleToggleAuditEdit(uc.id, e.target.checked)}
                              />
                              <span>Audit Edit</span>
                            </label>
                          )}
                          <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => handleRemoveComp(uc.id)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {availableCompanies.length > 0 && (
                    <div className="um-assign-row">
                      <select className="form-input" value={assignCompId} onChange={(e) => setAssignCompId(e.target.value)}>
                        <option value="">Select company…</option>
                        {availableCompanies.map((c) => <option key={c.id} value={c.id}>{c.short_name} — {c.name}</option>)}
                      </select>
                      <select className="form-input form-input--sm" value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                        {COMPANY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button type="button" className="btn btn-sm btn-primary" disabled={!assignCompId} onClick={handleAssign}>Assign</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save Changes'}</button>
              <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
              <button type="button" className={`btn btn-sm ${selectedUser.is_active ? 'btn-danger-outline' : ''}`} style={{ marginLeft: 'auto' }} onClick={handleToggleActive}>
                {selectedUser.is_active ? 'Deactivate User' : 'Activate User'}
              </button>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
