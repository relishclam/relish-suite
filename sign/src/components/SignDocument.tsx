/**
 * <SignDocument /> — shared component for Pramaana, Suite, ClamFlow, Approvals.
 *
 * Drop-in: copies into each app's src/components/. Requires:
 *   @supabase/supabase-js, qrcode.react
 *   supabase client exported from ../lib/supabase (or local equivalent)
 *
 * Displays QR code for phone-based signing. Listens on Supabase Realtime
 * for status updates. Shows signed/rejected/expired states automatically.
 */

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
// createClient import kept only for type reference in JSDoc
import type { } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SignDocumentProps {
  documentPath: string;
  documentName: string;
  documentType: 'pdf' | 'image' | 'generated';
  sourceApp: 'pramaana' | 'suite' | 'clamflow' | 'approvals';
  sourceRecordId?: string;
  signerUserId: string;
  onSigned: (signatureId: string, sealId: string) => void;
  onError?: (err: Error) => void;
  /** Supabase client instance — pass from the host app */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  /** SHA-256 hex hash of the document */
  documentHash: string;
  /** UUID of the user who triggered the signing request */
  requestedBy: string;
}

interface SigningRequest {
  id: string;
  status: 'pending' | 'signed' | 'rejected' | 'expired';
  expires_at: string;
  signed_at?: string;
  signature_bytes?: string;
  signing_key_id?: string;
}

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://sign.relishfoods.co';

// ── Component ──────────────────────────────────────────────────────────────

export default function SignDocument({
  documentPath,
  documentName,
  documentType,
  sourceApp,
  sourceRecordId,
  signerUserId,
  onSigned,
  onError,
  supabase,
  documentHash,
  requestedBy,
}: SignDocumentProps) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<'creating' | 'pending' | 'signed' | 'rejected' | 'expired'>('creating');
  const [sealId, setSealId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(600);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create signing request on mount
  useEffect(() => {
    async function createRequest() {
      const { data, error } = await supabase
        .schema('registry')
        .from('signing_requests')
        .insert({
          signer_user_id: signerUserId,
          requested_by: requestedBy,
          document_path: documentPath,
          document_hash: documentHash,
          document_name: documentName,
          document_type: documentType,
          source_app: sourceApp,
          source_record_id: sourceRecordId ?? null,
        })
        .select('id, expires_at')
        .single();

      if (error || !data) {
        onError?.(error ?? new Error('Failed to create signing request'));
        return;
      }

      setRequestId(data.id);
      setStatus('pending');

      const expiresAt = new Date(data.expires_at).getTime();
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining === 0) {
          setStatus('expired');
          clearInterval(timerRef.current!);
        }
      }, 1000);
    }
    createRequest();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to Realtime once we have a requestId
  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`signing_request:${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'registry',
          table: 'signing_requests',
          filter: `id=eq.${requestId}`,
        },
        async (payload: { new: SigningRequest }) => {
          const updated = payload.new;
          setStatus(updated.status);

          if (updated.status === 'signed') {
            if (timerRef.current) clearInterval(timerRef.current);
            // Fetch the document_signature row for seal_id + signer_name
            const { data: sigRow } = await supabase
              .schema('registry')
              .from('document_signatures')
              .select('id, seal_id, signer_name, signed_at')
              .eq('request_id', requestId)
              .single();

            if (sigRow) {
              setSealId(sigRow.seal_id);
              setSignerName(sigRow.signer_name);
              setSignedAt(sigRow.signed_at);
              onSigned(sigRow.id, sigRow.seal_id);
            }
          }
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [requestId, supabase, onSigned]);

  const qrUrl = requestId ? `${APP_ORIGIN}/scan/${requestId}` : '';
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  // ── Render states ─────────────────────────────────────────────────────

  if (status === 'creating') {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-purple-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 border border-purple-200 rounded-xl bg-white">
        <p className="text-sm text-gray-500">Scan with Relish Sign on your phone</p>
        <div className="p-3 border-2 border-purple-800 rounded-lg">
          <QRCodeSVG value={qrUrl} size={180} level="M" />
        </div>
        <p className="text-xs text-gray-400 font-mono">
          Expires in {mm}:{ss}
        </p>
        <button
          onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (channelRef.current) supabase.removeChannel(channelRef.current);
            setStatus('expired');
          }}
          className="text-xs text-gray-400 underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (status === 'signed') {
    return (
      <div className="flex flex-col items-center gap-3 p-6 border border-teal-300 rounded-xl bg-teal-50">
        <span className="text-2xl">✅</span>
        <p className="font-semibold text-teal-700">Document Signed</p>
        {signerName && <p className="text-sm text-gray-600">Signed by <strong>{signerName}</strong></p>}
        {sealId && <p className="text-xs font-mono text-orange-600">{sealId}</p>}
        {signedAt && (
          <p className="text-xs text-gray-500">
            {new Date(signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </p>
        )}
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="flex flex-col items-center gap-3 p-6 border border-red-200 rounded-xl bg-red-50">
        <span className="text-2xl">❌</span>
        <p className="font-semibold text-red-700">Signing Rejected</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-purple-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // expired
  return (
    <div className="flex flex-col items-center gap-3 p-6 border border-gray-200 rounded-xl bg-gray-50">
      <span className="text-2xl">⏱</span>
      <p className="font-semibold text-gray-600">Request Expired</p>
      <button
        onClick={() => window.location.reload()}
        className="text-sm text-purple-800 underline"
      >
        Regenerate
      </button>
    </div>
  );
}
