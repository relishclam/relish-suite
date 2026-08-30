import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, checkRelishMembership } from '../lib/auth';
import { getActiveSigningKey } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await signIn(email, password);
    if (authError) {
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }

    const isMember = await checkRelishMembership();
    if (!isMember) {
      setError(
        'You are not authorised to use Relish Sign. Contact your Relish Group administrator.',
      );
      setLoading(false);
      return;
    }

    const existingKey = await getActiveSigningKey();
    navigate(existingKey ? '/history' : '/enroll', { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <img src="/Relish-Logo.png" alt="Relish" className="h-14 mb-8" />
      <h1 className="text-2xl font-bold text-relish-purple mb-1">Relish Sign</h1>
      <p className="text-sm text-gray-500 mb-8">Digital Signature</p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
        <input
          type="email"
          autoComplete="email"
          placeholder="Work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-relish-purple"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-relish-purple"
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-relish-purple text-white rounded-lg py-3 font-semibold text-sm disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
