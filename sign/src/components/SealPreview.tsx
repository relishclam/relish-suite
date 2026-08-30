import { useEffect, useRef, useState } from 'react';
import { renderSeal, type SealData } from '../lib/seal';

interface SealPreviewProps {
  data: SealData;
  className?: string;
}

/** Renders the Relish Sign seal on a canvas and displays it as an image. */
export default function SealPreview({ data, className }: SealPreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    renderSeal(data).then((blob) => {
      if (!mountedRef.current) return;
      setDataUrl(URL.createObjectURL(blob));
    });
    return () => {
      mountedRef.current = false;
    };
  }, [data]);

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className ?? ''}`}
        style={{ width: 320, height: 160 }}
      >
        <div className="w-5 h-5 border-2 border-relish-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Relish Sign seal"
      className={`rounded-lg shadow ${className ?? ''}`}
      style={{ width: 320, height: 160 }}
    />
  );
}
