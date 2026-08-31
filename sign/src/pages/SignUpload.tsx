import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSession, getCurrentUserName } from '../lib/auth';
import { hashFile, requestBiometricAuth, signHash } from '../lib/crypto';
import { loadPrivateKey } from '../lib/indexeddb';
import { uploadQuickSign, stampAndUpload } from '../lib/storage';
import { renderSeal } from '../lib/seal';
import { isMobileDevice } from '../lib/device';
import SealPreview from '../components/SealPreview';
import { loadWebAuthnCredId } from '../lib/webauthn';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://sign.relishfoods.co';
const MAX_SIZE = 20 * 1024 * 1024;

type Step = 'pick' | 'review' | 'processing' | 'success';

interface SignResult {
  sealId: string;
  signerName: string;
  sealedDocPath: string | null;
  signedAt: Date;
  originalFileName: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SignUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [signerName, setSignerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);

    if (file.size > MAX_SIZE) {
      setFileError('File exceeds 20 MB limit. Please choose a smaller file.');
      return;
    }

    setSelectedFile(file);
    getCurrentUserName().then(setSignerName);
    setStep('review');
  }

  async function handleSign() {
    if (!selectedFile) return;
    setError(null);
    // Desktop always uses QR flow — private key lives on enrolled phone only
    const privateKey = await loadPrivateKey();
    if (privateKey && isMobileDevice()) {
      await doMobileSign();
    } else {
      await doDesktopSign();
    }
  }

  async function doDesktopSign() {
    if (!selectedFile) return;
    setStep('processing');
    setProcessingStatus('Uploading…');
    try {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      // Verify user has at least one enrolled device before uploading
      const { data: keys } = await supabase
        .from('signing_keys')
        .select('id')
        .eq('user_id', session.user.id)
        .is('revoked_at', null)
        .limit(1);

      if (!keys || keys.length === 0) {
        setError(
          'You have not enrolled a signing device yet. ' +
          'Open Relish Sign on your phone to enrol.',
        );
        setStep('review');
        return;
      }

      const documentHash = await hashFile(selectedFile);
      const docType: 'pdf' | 'image' = selectedFile.type === 'application/pdf' ? 'pdf' : 'image';
      const documentPath = await uploadQuickSign(selectedFile, session.user.id);

      const { data, error } = await supabase
        .from('signing_requests')
        .insert({
          signer_user_id: session.user.id,
          requested_by: session.user.id,
          document_path: documentPath,
          document_hash: documentHash,
          document_name: selectedFile.name,
          document_type: docType,
          source_app: 'relish-sign',
          source_record_id: null,
        })
        .select('id, expires_at')
        .single();

      if (error || !data) throw error ?? new Error('Failed to create signing request');

      navigate('/desktop-qr', {
        state: {
          requestId: data.id,
          documentPath,
          documentHash,
          documentName: selectedFile.name,
          documentType: docType,
          expiresAt: data.expires_at,
          originalFileName: selectedFile.name,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStep('review');
    }
  }

  async function doMobileSign() {
    if (!selectedFile) return;
    setError(null);
    setStep('processing');
    setProcessingStatus('Verifying your identity…');

    try {
      // Biometric gate — fires before any upload or signing
      let authPassed = false;
      try {
        authPassed = await requestBiometricAuth(loadWebAuthnCredId());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStep('review');
        return;
      }
      if (!authPassed) {
        setError('Authentication cancelled. Document not signed.');
        setStep('review');
        return;
      }

      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      const documentHash = await hashFile(selectedFile);

      setProcessingStatus('Uploading…');
      const documentPath = await uploadQuickSign(selectedFile, session.user.id);

      setProcessingStatus('Signing…');
      const privateKey = await loadPrivateKey();
      if (!privateKey) throw new Error('No signing key found on this device. Please re-enrol.');

      const { data: keyRow } = await supabase
        .from('signing_keys')
        .select('id')
        .eq('user_id', session.user.id)
        .is('revoked_at', null)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .single();
      if (!keyRow) throw new Error('Signing key not found in registry.');

      const signatureBytes = await signHash(documentHash, privateKey);
      const name = signerName || (await getCurrentUserName());
      const signedAt = new Date();
      const docType: 'pdf' | 'image' = selectedFile.type === 'application/pdf' ? 'pdf' : 'image';

      // Insert signing_requests with status='signed' for self-initiated signing
      const { data: reqRow } = await supabase
        .from('signing_requests')
        .insert({
          signer_user_id: session.user.id,
          requested_by: session.user.id,
          document_path: documentPath,
          document_hash: documentHash,
          document_name: selectedFile.name,
          document_type: docType,
          source_app: 'relish-sign',
          source_record_id: null,
          status: 'signed',
          signature_bytes: signatureBytes,
          signing_key_id: keyRow.id,
          signed_at: signedAt.toISOString(),
        })
        .select('id')
        .single();

      const { data: sigRecord, error: sigErr } = await supabase
        .from('document_signatures')
        .insert({
          signer_user_id: session.user.id,
          signing_key_id: keyRow.id,
          signer_name: name,
          document_path: documentPath,
          document_hash: documentHash,
          document_name: selectedFile.name,
          document_type: docType,
          source_app: 'relish-sign',
          source_record_id: null,
          signature_bytes: signatureBytes,
          signed_at: signedAt.toISOString(),
          request_id: reqRow?.id ?? null,
        })
        .select('id, seal_id')
        .single();

      if (sigErr || !sigRecord) throw sigErr ?? new Error('Failed to record signature');

      await supabase.from('signing_keys')
        .update({ last_used_at: signedAt.toISOString() })
        .eq('id', keyRow.id);

      setProcessingStatus('Applying seal…');

      let sealedDocPath: string | null = null;
      let sealPath: string | null = null;
      try {
        const sealBlob = await renderSeal({ signerName: name, sealId: sigRecord.seal_id, signedAt });
        const stampResult = await stampAndUpload({
          documentPath,
          documentName: selectedFile.name,
          documentType: docType,
          sealBlob,
          signatureId: sigRecord.id,
          userId: session.user.id,
          sealId: sigRecord.seal_id,
        });
        sealedDocPath = stampResult.sealedPath;
        sealPath = stampResult.sealPath;
        await supabase.from('document_signatures').update({
          seal_image_path: sealPath,
          sealed_doc_path: sealedDocPath,
        }).eq('id', sigRecord.id);
      } catch (stampErr) {
        console.error('Stamp failed:', stampErr);
      }

      setResult({
        sealId: sigRecord.seal_id,
        signerName: name,
        sealedDocPath,
        signedAt,
        originalFileName: selectedFile.name,
      });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
      setStep('review');
    }
  }

  async function handleDownload() {
    if (!result?.sealedDocPath) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('relish-sign-docs')
        .download(result.sealedDocPath);
      if (error || !data) throw error ?? new Error('Download failed');
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SIGNED-${result.originalFileName}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
    setDownloading(false);
  }

  async function handleCopyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(`${APP_ORIGIN}/verify/${result.sealId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Step: Pick ──────────────────────────────────────────────────────────

  if (step === 'pick') {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
          <button onClick={() => navigate('/history')} className="text-gray-500 text-xl leading-none">←</button>
          <span className="font-semibold text-relish-purple">Sign a Document</span>
        </div>

        <div className="flex-1 flex flex-col px-4 py-6 gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl gap-3 min-h-[200px]"
          >
            <span className="text-5xl">📄</span>
            <p className="font-semibold text-gray-700">Tap to select a file</p>
            <p className="text-sm text-gray-400">PDF, JPG, PNG supported</p>
          </button>

          {fileError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {fileError}
            </p>
          )}

          <p className="text-sm text-gray-500 text-center">Or take a photo:</p>

          <div className="flex gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 border border-gray-200 rounded-xl py-4 flex flex-col items-center gap-1"
            >
              <span className="text-2xl">📷</span>
              <span className="text-sm text-gray-600">Camera</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 border border-gray-200 rounded-xl py-4 flex flex-col items-center gap-1"
            >
              <span className="text-2xl">🖼</span>
              <span className="text-sm text-gray-600">Gallery</span>
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  // ── Step: Review ────────────────────────────────────────────────────────

  if (step === 'review' && selectedFile) {
    const isPdf = selectedFile.type === 'application/pdf';

    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
          <button onClick={() => { setSelectedFile(null); setError(null); setStep('pick'); }} className="text-gray-500 text-xl leading-none">←</button>
          <span className="font-semibold text-relish-purple">Review Document</span>
        </div>

        <div className="flex-1 flex flex-col px-4 py-6 gap-6 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Document</p>
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{isPdf ? '📄' : '🖼'}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 break-all">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatSize(selectedFile.size)} · {isPdf ? 'PDF' : 'Image'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Signing as</p>
            <div className="flex justify-center">
              <SealPreview
                data={{ signerName, sealId: 'RSG----- · preview', signedAt: new Date() }}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
        </div>

        <div className="px-4 pb-10 flex flex-col gap-3">
          <button
            onClick={handleSign}
            className="w-full bg-relish-purple text-white rounded-xl py-4 font-semibold text-base"
          >
            Sign This Document
          </button>
          <button
            onClick={() => { setSelectedFile(null); setError(null); setStep('pick'); }}
            className="w-full text-gray-400 text-sm py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Processing ────────────────────────────────────────────────────

  if (step === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center gap-4">
        <div className="w-10 h-10 border-4 border-relish-purple border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600">{processingStatus}</p>
      </div>
    );
  }

  // ── Step: Success ───────────────────────────────────────────────────────

  if (step === 'success' && result) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex flex-col items-center px-6 pt-8 pb-4 gap-3">
          <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-2xl">✅</div>
          <h1 className="text-xl font-bold text-relish-purple">Document Signed</h1>
          <SealPreview
            data={{ signerName: result.signerName, sealId: result.sealId, signedAt: result.signedAt }}
          />
          <p className="text-xs font-mono text-relish-orange">{result.sealId}</p>
          <p className="text-xs text-gray-400">
            {result.signedAt.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false,
            })} IST
          </p>
        </div>

        <div className="flex-1 px-4 pb-10 flex flex-col gap-3">
          {result.sealedDocPath ? (
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
            className="w-full border border-relish-purple text-relish-purple rounded-xl py-4 font-semibold text-base"
          >
            🔗 {copied ? 'Copied!' : 'Copy Verification Link'}
          </button>

          <button
            onClick={() => { setSelectedFile(null); setResult(null); setError(null); setStep('pick'); }}
            className="w-full border border-gray-200 text-gray-600 rounded-xl py-3 text-sm"
          >
            Sign Another Document
          </button>

          <button
            onClick={() => navigate('/history')}
            className="w-full text-gray-400 text-sm py-2"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return null;
}
