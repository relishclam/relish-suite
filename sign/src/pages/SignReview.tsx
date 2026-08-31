import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { loadPrivateKey } from '../lib/indexeddb';
import { signHash, requestBiometricAuth } from '../lib/crypto';
import { renderSeal } from '../lib/seal';
import { stampAndUpload } from '../lib/storage';
import { getCurrentUserName } from '../lib/auth';

interface SigningRequest {
  id: string;
  signer_user_id: string;
  document_path: string;
  document_hash: string;
  document_name: string;
  document_type: string;
  source_app: string;
  status: string;
  expires_at: string;
  requested_by: string;
}

export default function SignReview() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<SigningRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchRequest() {
      if (!requestId) { setError('Invalid request.'); setLoading(false); return; }

      const session = await getSession();
      if (!session) { navigate('/login', { replace: true }); return; }

      const { data, error: fetchErr } = await supabase
        .from('signing_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchErr || !data) {
        setError('Signing request not found.');
        setLoading(false);
        return;
      }

      if (data.status !== 'pending') {
        setError('This request has already been used or has expired.');
        setLoading(false);
        return;
      }
      if (data.signer_user_id !== session.user.id) {
        setError('This request is not for you.');
        setLoading(false);
        return;
      }
      if (new Date(data.expires_at) <= new Date()) {
        setError('This request has expired.');
        setLoading(false);
        return;
      }

      setRequest(data);
      setLoading(false);

      const expiresAt = new Date(data.expires_at).getTime();
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining === 0) {
          clearInterval(timerRef.current!);
          setError('This request has expired.');
        }
      }, 1000);
    }
    fetchRequest();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [requestId, navigate]);

  async function handleSign() {
    if (!request) return;
    setSigning(true);
    setError(null);

    try {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      // Biometric gate — must pass before private key is loaded
      let authPassed = false;
      try {
        authPassed = await requestBiometricAuth();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setSigning(false);
        return;
      }
      if (!authPassed) {
        setError('Authentication cancelled. Document not signed.');
        setSigning(false);
        return;
      }

      const privateKey = await loadPrivateKey();
      if (!privateKey) throw new Error('No signing key found on this device. Please re-enrol.');

      // Retrieve active signing_key row for the key id
      const { data: keyRow } = await supabase
        .from('signing_keys')
        .select('id')
        .eq('user_id', session.user.id)
        .is('revoked_at', null)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .single();

      if (!keyRow) throw new Error('Signing key not found in registry.');

      const signatureBytes = await signHash(request.document_hash, privateKey);
      const signerName = await getCurrentUserName();
      const signedAt = new Date();

      // Update signing_requests row
      await supabase.from('signing_requests').update({
        status: 'signed',
        signature_bytes: signatureBytes,
        signing_key_id: keyRow.id,
        signed_at: signedAt.toISOString(),
      }).eq('id', request.id);

      // Insert permanent signature record
      const { data: sigRecord, error: sigErr } = await supabase
        .from('document_signatures')
        .insert({
          signer_user_id: session.user.id,
          signing_key_id: keyRow.id,
          signer_name: signerName,
          document_path: request.document_path,
          document_hash: request.document_hash,
          document_name: request.document_name,
          document_type: request.document_type,
          source_app: request.source_app,
          source_record_id: null,
          signature_bytes: signatureBytes,
          signed_at: signedAt.toISOString(),
          request_id: request.id,
        })
        .select('id, seal_id')
        .single();

      if (sigErr || !sigRecord) throw sigErr ?? new Error('Failed to record signature');

      // Update last_used_at on the key
      await supabase.from('signing_keys').update({ last_used_at: signedAt.toISOString() })
        .eq('id', keyRow.id);

      // Navigate to success immediately — stamp continues in background
      navigate('/sign-success', {
        replace: true,
        state: {
          sealId: sigRecord.seal_id,
          signerName,
          documentName: request.document_name,
          signedAt: signedAt.toISOString(),
        },
      });

      // Background: render seal + stamp document + update DB, retry once on failure
      const capturedId = sigRecord.id;
      const capturedSealId = sigRecord.seal_id;
      const capturedUserId = session.user.id;
      const capturedRequest = request;
      ;(async function doStamp(attempt: number) {
        try {
          const sealBlob = await renderSeal({ signerName, sealId: capturedSealId, signedAt });
          const result = await stampAndUpload({
            documentPath: capturedRequest.document_path,
            documentName: capturedRequest.document_name,
            documentType: capturedRequest.document_type as 'pdf' | 'image' | 'generated',
            sealBlob,
            signatureId: capturedId,
            userId: capturedUserId,
            sealId: capturedSealId,
          });
          await supabase.from('document_signatures').update({
            seal_image_path: result.sealPath,
            sealed_doc_path: result.sealedPath,
          }).eq('id', capturedId);
        } catch (err) {
          console.error(`Seal stamp attempt ${attempt + 1} failed:`, err);
          if (attempt === 0) setTimeout(() => doStamp(1), 3000);
        }
      })(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
      setSigning(false);
    }
  }

  async function handleReject() {
    if (!request) return;
    await supabase.from('signing_requests').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
    }).eq('id', request.id);
    navigate('/history', { replace: true });
  }

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
        <p className="text-red-600 text-sm mb-6">{error}</p>
        <button onClick={() => navigate('/history')} className="text-relish-purple text-sm underline">
          Back to Home
        </button>
      </div>
    );
  }

  if (!request) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const appLabels: Record<string, string> = {
    pramaana: 'Pramaana',
    suite: 'Relish Suite',
    clamflow: 'ClamFlow',
    approvals: 'Approvals',
    'relish-sign': 'Relish Sign',
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="text-gray-400 text-xl leading-none">←</button>
        <img src="/Relish-Logo.png" alt="Relish" className="h-8" />
      </div>

      <div className="flex-1 flex flex-col px-6 py-8 gap-6">
        <h1 className="text-lg font-bold text-relish-purple text-center">Sign Document</h1>

        {/* Document details */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {[
            ['Document', request.document_name],
            ['App', appLabels[request.source_app] ?? request.source_app],
            ['Expires', `${mm}:${ss}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-medium text-gray-800 text-right max-w-[60%] truncate">{value}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-center text-gray-400">
          Your biometric unlock will be requested to sign.
        </p>
      </div>

      {/* Action buttons */}
      <div className="px-6 pb-10 flex gap-3">
        <button
          onClick={handleReject}
          disabled={signing}
          className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-4 font-semibold text-sm disabled:opacity-40"
        >
          Reject
        </button>
        <button
          onClick={handleSign}
          disabled={signing || secondsLeft === 0}
          className="flex-1 bg-relish-purple text-white rounded-lg py-4 font-semibold text-sm disabled:opacity-40"
        >
          {signing ? 'Signing…' : 'SIGN'}
        </button>
      </div>
    </div>
  );
}
