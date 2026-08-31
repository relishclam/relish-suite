import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://sign.relishfoods.co';
const SCAN_PREFIX = `${APP_ORIGIN}/scan/`;
const EXPLAINER_KEY = 'hasSeenScanExplainer';

function CameraView() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    reader.decodeFromVideoDevice(undefined, el, (result, _err, controls) => {
      if (!result) return;
      const text = result.getText();
      let requestId: string | null = null;
      if (text.startsWith(SCAN_PREFIX)) {
        requestId = text.slice(SCAN_PREFIX.length).split('/')[0];
      } else if (/^[0-9a-f-]{36}$/.test(text)) {
        requestId = text;
      }
      if (requestId && !stopped) { stopped = true; controls.stop(); navigate(`/scan/${requestId}`); }
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        setCamError('Camera permission denied. Please allow camera access in your browser settings and try again.');
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no camera')) {
        setCamError('No camera found on this device.');
      } else {
        setCamError('Could not open camera. Make sure the app is opened over HTTPS and camera permission is granted.');
      }
    });
    return () => { stopped = true; };
  }, [navigate]);

  if (camError) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-8 text-center gap-4">
        <span className="text-4xl">📷</span>
        <p className="text-white text-sm leading-relaxed">{camError}</p>
        <button onClick={() => navigate(-1)} className="mt-2 text-relish-teal text-sm underline">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="relative w-full max-w-sm aspect-square">
        <video ref={videoRef} className="w-full h-full object-cover rounded-xl" muted playsInline autoPlay />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 border-2 border-relish-teal rounded-xl opacity-80" />
        </div>
      </div>
      <p className="text-white text-sm mt-6 opacity-70">Point camera at the QR code</p>
      <button onClick={() => navigate(-1)} className="mt-4 text-relish-teal text-sm underline">
        Cancel
      </button>
    </div>
  );
}

export default function Scanner() {
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(
    () => !!localStorage.getItem(EXPLAINER_KEY),
  );

  function handleOpenCamera() {
    localStorage.setItem(EXPLAINER_KEY, '1');
    setShowCamera(true);
  }

  if (showCamera) return <CameraView />;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="text-gray-500 text-xl leading-none">←</button>
        <span className="font-semibold text-relish-purple">Scan to Sign</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
        <span className="text-5xl">📷</span>
        <p className="text-gray-700 leading-relaxed">
          A QR code will appear on screen in
          <strong> Pramaana, Relish Suite, or ClamFlow</strong> when
          someone requests your signature.
        </p>
        <p className="text-gray-500 text-sm">Point your camera at that QR code.</p>
        <button
          onClick={handleOpenCamera}
          className="bg-relish-purple text-white rounded-xl py-4 px-8 font-semibold text-base"
        >
          Open Camera
        </button>
      </div>
    </div>
  );
}
