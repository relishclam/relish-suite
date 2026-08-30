import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { hashFile } from '../lib/crypto';
import { uploadQuickSign } from '../lib/storage';

interface SignatureRecord {
  id: string;
  seal_id: string;
  document_name: string;
  signed_at: string;
  source_app: string;
}

export default function History() {
  const navigate = useNavigate();
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickSignLoading, setQuickSignLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadHistory() {
      const session = await getSession();
      if (!session) { navigate('/login', { replace: true }); return; }

      const { data } = await supabase
        .from('document_signatures')
        .select('id, seal_id, document_name, signed_at, source_app')
        .eq('signer_user_id', session.user.id)
        .order('signed_at', { ascending: false })
        .limit(50);

      setSignatures(data ?? []);
      setLoading(false);
    }
    loadHistory();
  }, [navigate]);

  async function handleQuickSign(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuickSignLoading(true);

    try {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      const documentHash = await hashFile(file);
      const documentPath = await uploadQuickSign(file, session.user.id);

      const docType = file.type === 'application/pdf' ? 'pdf' : 'image';

      const { data, error } = await supabase
        .from('signing_requests')
        .insert({
          signer_user_id: session.user.id,
          requested_by: session.user.id,
          document_path: documentPath,
          document_hash: documentHash,
          document_name: file.name,
          document_type: docType,
          source_app: 'relish-sign',
          source_record_id: null,
        })
        .select('id')
        .single();

      if (error || !data) throw error ?? new Error('Failed to create signing request');

      navigate(`/scan/${data.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Quick Sign failed');
      setQuickSignLoading(false);
    }
  }

  const appLabels: Record<string, string> = {
    pramaana: 'Pramaana',
    suite: 'Suite',
    clamflow: 'ClamFlow',
    approvals: 'Approvals',
    'relish-sign': 'Quick Sign',
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <img src="/Relish-Logo.png" alt="Relish" className="h-8" />
        <span className="text-sm font-semibold text-relish-purple">Relish Sign</span>
      </div>

      {/* Quick Sign FAB */}
      <div className="px-4 pt-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={handleQuickSign}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={quickSignLoading}
          className="w-full bg-relish-purple text-white rounded-xl py-4 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {quickSignLoading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg">＋</span>
          )}
          Quick Sign
        </button>
        <p className="text-xs text-center text-gray-400 mt-2">
          Sign a PDF or image directly from this device
        </p>
      </div>

      {/* Scanner entry */}
      <div className="px-4 pt-3">
        <button
          onClick={() => navigate('/scanner')}
          className="w-full border border-relish-purple text-relish-purple rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2"
        >
          <span>📷</span> Scan QR Code
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
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(sig.signed_at).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false,
                  })} IST
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
