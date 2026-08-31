import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://sign.relishfoods.co';

interface QRState {
  requestId: string;
  documentPath: string;
  documentHash: string;
  documentName: string;
  documentType: string;
  expiresAt: string;
  originalFileName: string;
}

interface SignedResult {
  sealId: string;
  signerName: string;
  sealImageUrl: string | null;
  sealedDocPath: string | null;
  signedAt: string;
}

type View = 'waiting' | 'signed' | 'rejected' | 'expired';

export default function DesktopQR() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as QRState | null;

  const [requestId, setRequestId] = useState(state?.requestId ?? '');
  const [expiresAt, setExpiresAt] = useState(state?.expiresAt ?? '');
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!state?.expiresAt) return 0;
    return Math.max(0, Math.floor((new Date(state.expiresAt).getTime() - Date.now()) / 1000));
  });
  const [view, setView] = useState<View>('waiting');
  const [signedResult, setSignedResult] = useState<SignedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [renewingCode, setRenewingCode] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Countdown
  useEffect(() => {
    if (!expiresAt) return;
    const expiresMs = new Date(expiresAt).getTime();
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        clearInterval(timerRef.current!);
        setView((v) => v === 'waiting' ? 'expired' : v);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt]);

  // Realtime subscription on the signing_requests row
  useEffect(() => {
    if (!requestId) return;
    const channel = supabase
      .channel(`signing_request_${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'registry', table: 'signing_requests', filter: `id=eq.${requestId}` },
        async (payload: { new: { status: string } }) => {
          if (payload.new.status === 'signed') {
            if (timerRef.current) clearInterval(timerRef.current);
            await loadSignedResult(requestId);
          } else if (payload.new.status === 'rejected') {
            if (timerRef.current) clearInterval(timerRef.current);
            setView('rejected');
          }
        },
      )
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [requestId]);

  // All hooks declared — now safe to guard
  if (!state) return <Navigate to="/history" replace />;

  async function loadSignedResult(reqId: string) {
    const { data: sig } = await supabase
      .from('document_signatures')
      .select('id, seal_id, signer_name, signed_at, seal_image_path, sealed_doc_path')
      .eq('request_id', reqId)
      .single();

    let sealImageUrl: string | null = null;
    if (sig?.seal_image_path) {
      const { data: urlData } = await supabase.storage
        .from('relish-sign-docs')
        .createSignedUrl(sig.seal_image_path as string, 120);
      sealImageUrl = urlData?.signedUrl ?? null;
    }

    if (sig) {
      setSignedResult({
        sealId: sig.seal_id as string,
        signerName: sig.signer_name as string,
        sealImageUrl,
        sealedDocPath: sig.sealed_doc_path as string | null,
        signedAt: sig.signed_at as string,
      });
    }
    setView('signed');
  }

  async function handleGenerateNewCode() {
    setRenewingCode(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('signing_requests')
        .insert({
          signer_user_id: session.user.id,
          requested_by: session.user.id,
          document_path: state!.documentPath,
          document_hash: state!.documentHash,
          document_name: state!.documentName,
          document_type: state!.documentType,
          source_app: 'relish-sign',
          source_record_id: null,
        })
        .select('id, expires_at')
        .single();
      if (error || !data) throw error ?? new Error('Failed to generate code');
      setRequestId(data.id);
      setExpiresAt(data.expires_at);
      setSecondsLeft(Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000));
      setView('waiting');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate new code');
    }
    setRenewingCode(false);
  }

  async function handleDownload() {
    if (!signedResult?.sealedDocPath) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('relish-sign-docs')
        .createSignedUrl(signedResult.sealedDocPath, 300);
      if (error || !data) throw error ?? new Error('Failed');
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = `SIGNED-${state!.originalFileName}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
    setDownloading(false);
  }

  async function handleCopyLink() {
    if (!signedResult) return;
    await navigator.clipboard.writeText(`${APP_ORIGIN}/verify/${signedResult.sealId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  // ── Signed ──────────────────────────────────────────────────────────────

  if (view === 'signed') {
    return (
      <div className="min-h-screen flex flex-col bg-white max-w-lg mx-auto">
        <div className="flex flex-col items-center px-8 pt-10 pb-4 gap-4">
          <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-2xl">✅</div>
          <h1 className="text-2xl font-bold text-relish-purple">Document Signed</h1>

          {signedResult?.sealImageUrl ? (
            <img
              src={signedResult.sealImageUrl}
              alt="Relish Sign seal"
              style={{ width: 320, height: 160 }}
              className="rounded-lg shadow"
            />
          ) : (
            <div className="w-80 h-40 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
              <span className="text-sm text-gray-400">Seal loading…</span>
            </div>
          )}

          {signedResult && (
            <>
              <p className="text-xs font-mono text-relish-orange">{signedResult.sealId}</p>
              <p className="text-xs text-gray-400">
                {new Date(signedResult.signedAt).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', hour12: false,
                })} IST
              </p>
            </>
          )}
        </div>

        <div className="px-6 pb-10 flex flex-col gap-3">
          {signedResult?.sealedDocPath ? (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full bg-relish-purple text-white rounded-xl py-4 font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {downloading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : '⬇'} Download Sealed Document
            </button>
          ) : (
            <div className="w-full border border-gray-200 rounded-xl py-4 text-center text-sm text-gray-400">
              Sealed document is being prepared…
            </div>
          )}

          <button
            onClick={handleCopyLink}
            disabled={!signedResult}
            className="w-full border border-relish-purple text-relish-purple rounded-xl py-4 font-semibold text-base disabled:opacity-40"
          >
            🔗 {copied ? 'Copied!' : 'Copy Verification Link'}
          </button>

          <button
            onClick={() => navigate('/upload')}
            className="w-full border border-gray-200 text-gray-600 rounded-xl py-3 text-sm"
          >
            Sign Another Document
          </button>
          <button onClick={() => navigate('/history')} className="w-full text-gray-400 text-sm py-2">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Rejected ────────────────────────────────────────────────────────────

  if (view === 'rejected') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-8 text-center gap-5 max-w-lg mx-auto">
        <span className="text-5xl">❌</span>
        <h2 className="text-xl font-bold text-gray-700">Signing was declined</h2>
        <p className="text-sm text-gray-500">The request was rejected on your phone.</p>
        <button
          onClick={handleGenerateNewCode}
          disabled={renewingCode}
          className="bg-relish-purple text-white rounded-xl py-4 px-8 font-semibold disabled:opacity-50"
        >
          {renewingCode ? 'Generating…' : 'Try Again'}
        </button>
        <button onClick={() => navigate('/history')} className="text-gray-400 text-sm underline">
          Back to Home
        </button>
      </div>
    );
  }

  // ── Expired ─────────────────────────────────────────────────────────────

  if (view === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-8 text-center gap-5 max-w-lg mx-auto">
        <span className="text-5xl">⏱</span>
        <h2 className="text-xl font-bold text-gray-700">Code Expired</h2>
        <p className="text-sm text-gray-500">Generate a new code to continue — no re-upload needed.</p>
        <button
          onClick={handleGenerateNewCode}
          disabled={renewingCode}
          className="bg-relish-purple text-white rounded-xl py-4 px-8 font-semibold disabled:opacity-50"
        >
          {renewingCode ? 'Generating…' : 'Generate New Code'}
        </button>
        <button onClick={() => navigate('/history')} className="text-gray-400 text-sm underline">
          Cancel — Back to Home
        </button>
      </div>
    );
  }

  // ── Waiting ─────────────────────────────────────────────────────────────

  const qrUrl = `${APP_ORIGIN}/scan/${requestId}`;

  return (
    <div className="min-h-screen flex flex-col bg-white max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="text-gray-500 text-xl leading-none">←</button>
        <span className="font-semibold text-relish-purple">Sign a Document</span>
      </div>

      <div className="flex-1 flex flex-col px-6 py-6 gap-6">
        {/* Document summary */}
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Document ready to sign</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{state.documentType === 'pdf' ? '📄' : '🖼'}</span>
            <p className="text-sm font-medium text-gray-800 break-all">{state.documentName}</p>
          </div>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-gray-600 text-center">
            Open <strong>Relish Sign</strong> on your phone and scan this code:
          </p>
          <div className="p-4 border-2 border-relish-purple rounded-xl bg-white">
            <QRCodeSVG
              value={qrUrl}
              size={256}
              fgColor="#6B21A8"
              bgColor="#ffffff"
              level="M"
            />
          </div>
          <p className="text-sm font-mono text-gray-500">
            Expires in{' '}
            <span className={secondsLeft < 60 ? 'text-red-500 font-bold' : ''}>
              {mm}:{ss}
            </span>{' '}
            ⏱
          </p>
        </div>

        {/* Waiting indicator */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-gray-400">
            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Waiting for your phone…</span>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-gray-400 underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
