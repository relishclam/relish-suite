import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import relishLogo from '../assets/relish-logo.png';

export default function SetPassword() {
  const navigate    = useNavigate();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [error,     setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    let subscription = null;

    const initializeSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (currentSession?.user) {
          setCheckingSession(false);
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = params.get('access_token') || hashParams.get('access_token');
        const refreshToken = params.get('refresh_token') || hashParams.get('refresh_token');
        const code = params.get('code');
        const tokenHash = params.get('token_hash') || hashParams.get('token_hash');
        const tokenType = params.get('type') || hashParams.get('type');

        if (accessToken && refreshToken) {
          const { data, error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!mounted) return;
          if (sessionErr) {
            setError(sessionErr.message || 'The invite link could not be used.');
          } else if (data?.session?.user) {
            setCheckingSession(false);
            return;
          }
        }

        if (code) {
          const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!mounted) return;
          if (codeErr) {
            setError(codeErr.message || 'The invite link could not be exchanged.');
          } else if (data?.session?.user) {
            setCheckingSession(false);
            return;
          }
        }

        if (tokenHash && tokenType) {
          const { data, error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType,
          });

          if (!mounted) return;
          if (verifyErr) {
            setError(verifyErr.message || 'The invite link could not be verified. Please request a fresh invite.');
          } else if (data?.session?.user) {
            setCheckingSession(false);
            return;
          }
        }

        const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!mounted) return;
          if (nextSession?.user) {
            setCheckingSession(false);
          }
        });
        subscription = authSubscription;
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'The invite link could not be loaded.');
      } finally {
        if (mounted && !error) {
          setCheckingSession(false);
        }
      }
    };

    initializeSession();

    return () => {
      mounted = false;
      if (subscription) subscription.data.subscription.unsubscribe();
    };
  }, []);

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Your invite session is not ready yet. Please open the link again or request a fresh invite.');
      }

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
            disabled={submitting || checkingSession}
          >
            {submitting ? 'Saving…' : checkingSession ? 'Preparing invite…' : 'Set Password & Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
