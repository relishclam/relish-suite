import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SlideOver from '../components/common/SlideOver';
import { fetchProfiles, updateProfile, fetchUserCompanies, assignUserCompany, removeUserCompany, inviteUser } from '../lib/profiles';
import { fetchCompanies } from '../lib/companies';
import { writeAuditLog } from '../lib/auditLog';

const ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'operations', label: 'Operations' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

export default function UserManagement() {
  const { isSuperAdmin } = useAuth();
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
  const [userComps, setUserComps] = useState([]);
  const [compLoading, setCompLoading] = useState(false);
  const [assignCompId, setAssignCompId] = useState('');

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesData, companiesData] = await Promise.all([fetchProfiles(), fetchCompanies()]);
      setUsers(profilesData);
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
  const openEdit = async (user) => {
    setSlideMode('edit');
    setSelectedUser(user);
    setForm({ full_name: user.full_name || '', role: user.role || 'viewer', is_active: user.is_active });
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
    setSlideOpen(true);
  };

  const closeSlide = () => {
    setSlideOpen(false);
    setSelectedUser(null);
    setUserComps([]);
    setAssignCompId('');
  };

  // ── Save profile ──
  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await updateProfile(selectedUser.id, {
        full_name: form.full_name,
        role: form.role,
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
      await assignUserCompany(selectedUser.id, assignCompId);
      writeAuditLog({ action: 'assign_company', tableName: 'user_companies', recordId: selectedUser.id });
      addToast('Company assigned', 'success');
      setAssignCompId('');
      setUserComps(await fetchUserCompanies(selectedUser.id));
    } catch (err) {
      addToast(err.message, 'error');
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
    if (!inviteEmail) return;
    setSaving(true);
    try {
      await inviteUser(inviteEmail);
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

  if (!isSuperAdmin) {
    return (
      <div className="um-page">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p className="text-muted">User management is restricted to Super Admins.</p>
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
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '2rem' }}>No users found</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="md-table__row" onClick={() => openEdit(u)}>
                  <td><strong>{u.full_name || '—'}</strong></td>
                  <td>{u.email || '—'}</td>
                  <td><span className={`badge badge--${u.role === 'super_admin' ? 'navy' : u.role === 'admin' ? 'teal' : 'default'}`}>{ROLES.find((r) => r.value === u.role)?.label || u.role}</span></td>
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
              Send a magic-link invite. The user will be created in Supabase Auth and can then sign in and be assigned companies/roles.
            </p>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input className="form-input" type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving || !inviteEmail} onClick={handleInvite}>{saving ? 'Sending…' : 'Send Invite'}</button>
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
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={form.role || 'viewer'} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
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
                          <span>{uc.companies?.short_name || uc.company_id} — {uc.companies?.name || ''}</span>
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
