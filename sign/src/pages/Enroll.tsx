import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateKeyPair } from '../lib/crypto';
import { storePrivateKey } from '../lib/indexeddb';
import { supabase } from '../lib/supabase';
import { getCurrentUserName, getSession } from '../lib/auth';
import SealPreview from '../components/SealPreview';
import { RELISH_SIGN_RP_ID, storeWebAuthnCredId } from '../lib/webauthn';

type Step = 'welcome' | 'name-device' | 'generating' | 'done';

export default function Enroll() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  // repairKeyId: set when user already has a signing key — only redo WebAuthn
  const [repairKeyId, setRepairKeyId] = useState<string | null>(null);
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

    // Check for an existing key that needs its passkey repaired
    const session = await getSession();
    if (session) {
      const { data: existingKey } = await supabase
        .from('signing_keys')
        .select('id')
        .eq('user_id', session.user.id)
        .is('revoked_at', null)
        .is('webauthn_credential_id', null)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingKey) setRepairKeyId(existingKey.id);
    }

    setStep('name-device');
  }

  async function handleGenerate() {
    setStep('generating');
    setError(null);

    try {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      // Register WebAuthn credential — ties DSC to this device's biometric/PIN
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Relish Sign', id: RELISH_SIGN_RP_ID },
          user: {
            id: new TextEncoder().encode(session.user.id),
            name: session.user.email ?? userName,
            displayName: userName,
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' as const },
            { alg: -257, type: 'public-key' as const },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform' as const,
            userVerification: 'required' as const,
            residentKey: 'preferred' as const,
          },
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      if (!credential) throw new Error('Passkey creation was cancelled. Please try again.');

      const webauthnCredentialId = btoa(
        String.fromCharCode(...new Uint8Array(credential.rawId))
      );
      storeWebAuthnCredId(webauthnCredentialId);

      if (repairKeyId) {
        // Repair mode — update existing key row, skip key generation
        const { error: updateErr } = await supabase
          .from('signing_keys')
          .update({ webauthn_credential_id: webauthnCredentialId })
          .eq('id', repairKeyId);
        if (updateErr) throw updateErr;
        setSealId(`RSG-0001 · ${repairKeyId.slice(0, 8)}`);
      } else {
        // Full enrollment — generate new ECDSA key pair
        const { publicKeyJwk, privateKey } = await generateKeyPair();
        await storePrivateKey(privateKey);

        const { data, error: insertError } = await supabase
          .from('signing_keys')
          .insert({
            user_id: session.user.id,
            display_name: deviceName.trim() || 'My Device',
            public_key_jwk: publicKeyJwk,
            webauthn_credential_id: webauthnCredentialId,
          })
          .select('id')
          .single();

        if (insertError || !data) throw insertError ?? new Error('Enrollment failed');
        setSealId(`RSG-0001 · ${data.id.slice(0, 8)}`);
      }

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
    // In repair mode skip the device name step — go straight to passkey prompt
    if (repairKeyId) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
          <img src="/Relish-Logo.png" alt="Relish" className="h-10 mb-8" />
          <h2 className="text-lg font-bold text-relish-purple mb-2">Register your fingerprint / PIN</h2>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed max-w-xs">
            Your signing key already exists. We just need to save your device
            passkey so you can authenticate when signing.
          </p>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <button
            onClick={handleGenerate}
            className="bg-relish-purple text-white rounded-lg py-3 px-8 font-semibold text-sm"
          >
            Set up Passkey
          </button>
        </div>
      );
    }
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
        <p className="text-sm text-gray-500">
          {repairKeyId ? 'Saving passkey…' : 'Generating your signing key…'}
        </p>
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
      <h2 className="text-lg font-bold text-relish-purple mb-2">
        {repairKeyId ? 'Passkey saved.' : 'Your DSC is ready.'}
      </h2>
      <p className="text-sm text-gray-500 mb-8">
        {repairKeyId
          ? 'Your fingerprint / PIN is now linked to your signing key.'
          : 'Your signing key is stored securely on this device.'}
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
