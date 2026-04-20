import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import relishLogo from '../assets/relish-logo.png';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function Login() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated → go to dashboard
  if (authLoading) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      // Auth state change will redirect via the Navigate above on re-render
    } catch (err) {
      setError(err.message || 'Sign in failed. Please check your credentials.');
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
          <p className="login-subtitle">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
