import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateKeyPair } from '../lib/crypto';
import { storePrivateKey } from '../lib/indexeddb';
import { supabase } from '../lib/supabase';
import { getCurrentUserName, getSession } from '../lib/auth';
import SealPreview from '../components/SealPreview';

type Step = 'welcome' | 'name-device' | 'generating' | 'done';

export default function Enroll() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android Phone';
    return 'My Device';
  });
  const [userName, setUserName] = useState('');
  const [sealId, setSealId] = useState('RSG-0001 · preview');
  const [error, setError] = useState<string | null>(null);

  async function handleBegin() {
    const name = await getCurrentUserName();
    setUserName(name);
    setStep('name-device');
  }

  async function handleGenerate() {
    setStep('generating');
    setError(null);

    try {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      const { publicKeyJwk, privateKey } = await generateKeyPair();

      // Store private key in IndexedDB before any network call
      await storePrivateKey(privateKey);

      const { data, error: insertError } = await supabase
        .from('signing_keys')
        .insert({
          user_id: session.user.id,
          display_name: deviceName.trim() || 'My Device',
          public_key_jwk: publicKeyJwk,
        })
        .select('id')
        .single();

      if (insertError || !data) throw insertError ?? new Error('Enrollment failed');

      // Use a placeholder seal_id for the preview
      setSealId(`RSG-0001 · ${data.id.slice(0, 8)}`);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
      setStep('name-device');
    }
  }

  // ── Step: Welcome ────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <img src="/Relish-Logo.png" alt="Relish" className="h-14 mb-6" />
        <h1 className="text-xl font-bold text-relish-purple mb-2">Set up your Relish Sign DSC</h1>
        <p className="text-sm text-gray-500 mb-10 leading-relaxed">
          Your Digital Signature Certificate is personal, device-bound, and
          exclusive to Relish Group members.
        </p>
        <button
          onClick={handleBegin}
          className="bg-relish-purple text-white rounded-lg py-3 px-8 font-semibold text-sm"
        >
          Begin
        </button>
      </div>
    );
  }

  // ── Step: Name device ────────────────────────────────────────────────

  if (step === 'name-device') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        <img src="/Relish-Logo.png" alt="Relish" className="h-10 mb-8" />
        <h2 className="text-lg font-bold text-relish-purple mb-1">What device is this?</h2>
        <p className="text-sm text-gray-500 mb-6">This name will appear on your signing key.</p>

        <input
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="e.g. Motty's iPhone 15"
          className="w-full max-w-sm border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-relish-purple mb-4"
        />

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        <button
          onClick={handleGenerate}
          disabled={!deviceName.trim()}
          className="bg-relish-purple text-white rounded-lg py-3 px-8 font-semibold text-sm disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  // ── Step: Generating ─────────────────────────────────────────────────

  if (step === 'generating') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <div className="w-10 h-10 border-4 border-relish-purple border-t-transparent rounded-full animate-spin mb-6" />
        <p className="text-sm text-gray-500">Generating your signing key…</p>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
      <img src="/Relish-Logo.png" alt="Relish" className="h-10 mb-6" />
      <div className="mb-6">
        <SealPreview
          data={{
            signerName: userName,
            sealId,
            signedAt: new Date(),
          }}
        />
      </div>
      <h2 className="text-lg font-bold text-relish-purple mb-2">Your DSC is ready.</h2>
      <p className="text-sm text-gray-500 mb-8">
        Your signing key is stored securely on this device.
      </p>
      <button
        onClick={() => navigate('/history', { replace: true })}
        className="bg-relish-purple text-white rounded-lg py-3 px-8 font-semibold text-sm"
      >
        Start Signing
      </button>
    </div>
  );
}
