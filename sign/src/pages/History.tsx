import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { loadWebAuthnCredId, storeWebAuthnCredId } from '../lib/webauthn';

interface SignatureRecord {
  id: string;
  seal_id: string;
  document_name: string;
  signed_at: string;
  source_app: string;
  sealed_doc_path: string | null;
}

export default function History() {
  const navigate = useNavigate();
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // null = checking, true = ok, false = passkey missing
  const [passkeyOk, setPasskeyOk] = useState<boolean | null>(null);

  useEffect(() => {
    async function loadHistory() {
      const session = await getSession();
      if (!session) { navigate('/login', { replace: true }); return; }

      const [sigResult, keyResult] = await Promise.all([
        supabase
          .from('document_signatures')
          .select('id, seal_id, document_name, signed_at, source_app, sealed_doc_path')
          .eq('signer_user_id', session.user.id)
          .order('signed_at', { ascending: false })
          .limit(50),
        supabase
          .from('signing_keys')
          .select('id, webauthn_credential_id')
          .eq('user_id', session.user.id)
          .is('revoked_at', null)
          .order('enrolled_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setSignatures(sigResult.data ?? []);

      const keyRow = keyResult.data;
      if (!keyRow) {
        // No signing key at all — needs full enrollment
        setPasskeyOk(false);
      } else if (keyRow.webauthn_credential_id) {
        // Backfill localStorage if missing (e.g. enrolled before this fix)
        if (!loadWebAuthnCredId()) storeWebAuthnCredId(keyRow.webauthn_credential_id);
        setPasskeyOk(true);
      } else {
        // Key exists but passkey was never registered
        setPasskeyOk(false);
      }

      setLoading(false);
    }
    loadHistory();
  }, [navigate]);

  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(sealedDocPath: string, sigId: string) {
    setDownloading(sigId);
    const { data, error } = await supabase.storage
      .from('relish-sign-docs')
      .createSignedUrl(sealedDocPath, 300);
    setDownloading(null);
    if (error || !data) { alert('Could not generate download link'); return; }
    window.open(data.signedUrl, '_blank');
  }

  const appLabels: Record<string, string> = {
    pramaana: 'Pramaana',
    suite: 'Suite',
    clamflow: 'ClamFlow',
    approvals: 'Approvals',
    'relish-sign': 'Sign a Document',
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <img src="/Relish-Logo.png" alt="Relish" className="h-8" />
        <span className="text-sm font-semibold text-relish-purple">Relish Sign</span>
      </div>

      {/* Setup incomplete banner */}
      {passkeyOk === false && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-xl mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Biometric setup incomplete</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              Your signing key exists but your device passkey was not saved.
              Tap Fix to complete setup — takes 10 seconds.
            </p>
            <button
              onClick={() => navigate('/enroll')}
              className="mt-2 bg-amber-500 text-white rounded-lg px-4 py-1.5 text-xs font-semibold"
            >
              Fix Now →
            </button>
          </div>
        </div>
      )}

      {/* Primary action — Sign a Document */}
      <div className="px-4 pt-4">
        <button
          onClick={() => navigate('/upload')}
          className="w-full bg-relish-purple text-white rounded-xl py-5 font-semibold text-lg flex flex-col items-center gap-1"
        >
          <span>+ Sign a Document</span>
          <span className="text-sm font-normal opacity-80">Upload and sign any file</span>
        </button>
      </div>

      {/* Secondary action — Scan QR */}
      <div className="px-4 pt-3">
        <button
          onClick={() => navigate('/scanner')}
          className="w-full border border-relish-purple text-relish-purple rounded-xl py-4 font-semibold text-sm flex flex-col items-center gap-0.5"
        >
          <span>📷 Scan QR Code</span>
          <span className="text-xs font-normal opacity-70">Sign a document requested by another Relish app</span>
        </button>
      </div>

      {/* Signature history */}
      <div className="flex-1 px-4 pt-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Recent Signatures
        </h2>

        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-6 h-6 border-2 border-relish-purple border-t-transparent rounded-full animate-spin" />
          </div>
        ) : signatures.length === 0 ? (
          <p className="text-center text-gray-400 text-sm pt-8">No signatures yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm"
              >
                <p className="text-sm font-medium text-gray-800 truncate">{sig.document_name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-relish-orange font-mono">{sig.seal_id}</span>
                  <span className="text-xs text-gray-400">
                    {appLabels[sig.source_app] ?? sig.source_app}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">
                    {new Date(sig.signed_at).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    })} IST
                  </p>
                  {sig.sealed_doc_path ? (
                    <button
                      onClick={() => handleDownload(sig.sealed_doc_path!, sig.id)}
                      disabled={downloading === sig.id}
                      className="text-xs text-relish-purple font-medium underline disabled:opacity-50"
                    >
                      {downloading === sig.id ? 'Preparing…' : '⬇ Download Sealed'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">Sealing…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
