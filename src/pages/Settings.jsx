import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import { updateProfile } from '../lib/profiles';

export default function Settings() {
  const { profile, user, companies, activeCompany, signOut } = useAuth();
  const addToast = useToast();
  const [name, setName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(user.id, { full_name: name });
      addToast('Profile updated — changes will appear on next sign-in', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <h1 className="settings-page__title">Settings</h1>

      <div className="card" style={{ maxWidth: 560 }}>
        <h3 className="um-section__title">Your Profile</h3>
        <div className="po-form__grid">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={user?.email || ''} readOnly />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <input className="form-input" value={profile?.role || ''} readOnly />
          </div>
          <div className="form-group form-group--span2">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, marginTop: '1.5rem' }}>
        <h3 className="um-section__title">Company Access</h3>
        {companies.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.8125rem' }}>No companies assigned.</p>
        ) : (
          <div className="um-company-list">
            {companies.map((c) => (
              <div key={c.id} className="um-company-list__item">
                <span><strong>{c.short_name}</strong> — {c.name}</span>
                {activeCompany?.id === c.id && <span className="badge badge--teal">Active</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button type="button" className="btn btn-danger-outline" onClick={signOut}>Sign Out</button>
      </div>
    </div>
  );
}
