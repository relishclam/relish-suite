import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { verifySignature } from '../lib/crypto';

interface VerificationResult {
  valid: boolean;
  signerName: string;
  sealId: string;
  signedAt: string;
  documentName: string;
  sourceApp: string;
  hashMatch: boolean;
  keyActive: boolean;
}

export default function Verify() {
  const { sealId } = useParams<{ sealId: string }>();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      if (!sealId) { setError('Invalid seal ID.'); setLoading(false); return; }

      const { data: sig, error: sigErr } = await supabase
        .from('document_signatures')
        .select('*, signing_keys(public_key_jwk, revoked_at, enrolled_at)')
        .eq('seal_id', sealId)
        .single();

      if (sigErr || !sig) {
        setError('Signature not found for this seal ID.');
        setLoading(false);
        return;
      }

      const keyData = (sig as { signing_keys: { public_key_jwk: JsonWebKey; revoked_at: string | null; enrolled_at: string } }).signing_keys;
      const keyActive = !keyData.revoked_at ||
        new Date(keyData.revoked_at) > new Date(sig.signed_at as string);

      let hashMatch = false;
      try {
        hashMatch = await verifySignature(
          sig.document_hash as string,
          sig.signature_bytes as string,
          keyData.public_key_jwk,
        );
      } catch {
        hashMatch = false;
      }

      setResult({
        valid: hashMatch && keyActive,
        signerName: sig.signer_name as string,
        sealId: sig.seal_id as string,
        signedAt: sig.signed_at as string,
        documentName: sig.document_name as string,
        sourceApp: sig.source_app as string,
        hashMatch,
        keyActive,
      });
      setLoading(false);
    }
    verify();
  }, [sealId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-relish-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <img src="/Relish-Logo.png" alt="Relish" className="h-10 mb-6" />
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const appLabels: Record<string, string> = {
    pramaana: 'Pramaana', suite: 'Relish Suite', clamflow: 'ClamFlow',
    approvals: 'Approvals', 'relish-sign': 'Relish Sign',
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex flex-col items-center px-6 pt-10 pb-6 border-b border-gray-100">
        <img src="/Relish-Logo.png" alt="Relish" className="h-10 mb-4" />
        <h1 className="text-lg font-bold text-gray-800">Relish Sign — Signature Verification</h1>
      </div>

      <div className="px-6 py-6 flex flex-col gap-4">
        {/* Overall result */}
        <div className={`rounded-xl px-5 py-4 text-center ${result.valid ? 'bg-teal-50 border border-teal-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`text-lg font-bold ${result.valid ? 'text-teal-700' : 'text-red-700'}`}>
            {result.valid ? '✅ VALID SIGNATURE' : '❌ INVALID SIGNATURE'}
          </p>
        </div>

        {/* Document details */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {[
            ['Document', result.documentName],
            ['Signed by', result.signerName],
            ['Digitally Signed on', new Date(result.signedAt).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false,
            }) + ' IST'],
            ['Seal ID', result.sealId],
            ['App', appLabels[result.sourceApp] ?? result.sourceApp],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-500">{label}</span>
              <span className={`text-sm font-medium text-right max-w-[60%] ${label === 'Seal ID' ? 'font-mono text-relish-orange' : 'text-gray-800'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Verification checks */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {[
            ['Hash matches signature', result.hashMatch],
            ['Key active (not revoked)', result.keyActive],
            ['Signed within key validity', result.keyActive],
          ].map(([label, ok]) => (
            <div key={label as string} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-600">{label as string}</span>
              <span className="text-sm">{ok ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
