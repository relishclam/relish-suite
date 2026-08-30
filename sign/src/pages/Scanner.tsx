import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://sign.relishfoods.co';
const SCAN_PREFIX = `${APP_ORIGIN}/scan/`;

export default function Scanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, controls) => {
      if (!result) return;
      const text = result.getText();
      let requestId: string | null = null;

      if (text.startsWith(SCAN_PREFIX)) {
        requestId = text.slice(SCAN_PREFIX.length).split('/')[0];
      } else if (/^[0-9a-f-]{36}$/.test(text)) {
        // Raw UUID fallback
        requestId = text;
      }

      if (requestId) {
        controls.stop();
        navigate(`/scan/${requestId}`);
      }
    });

    return () => {
      readerRef.current = null;
      // BrowserMultiFormatReader cleans up via the controls returned in the callback
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="relative w-full max-w-sm aspect-square">
        <video
          ref={videoRef}
          className="w-full h-full object-cover rounded-xl"
          muted
          playsInline
        />
        {/* Targeting overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 border-2 border-relish-teal rounded-xl opacity-80" />
        </div>
      </div>
      <p className="text-white text-sm mt-6 opacity-70">Point camera at the QR code</p>
      <button
        onClick={() => navigate(-1)}
        className="mt-4 text-relish-teal text-sm underline"
      >
        Cancel
      </button>
    </div>
  );
}
