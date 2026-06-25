import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import relishLogo from '../assets/relish-logo.png';

export default function SetPassword() {
  const navigate    = useNavigate();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [error,     setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to set password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-header">
          <img src={relishLogo} alt="Relish" className="login-logo" />
          <h1 className="login-title">Relish Business Suite</h1>
          <p className="login-subtitle">Welcome! Set your password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="password" className="form-label">New Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm" className="form-label">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              className="form-input"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Set Password & Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
