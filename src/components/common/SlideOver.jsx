import { useEffect, useRef } from 'react';

export default function SlideOver({ open, onClose, title, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="slideover-backdrop" onClick={onClose}>
      <div
        className="slideover"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slideover__header">
          <h2 className="slideover__title">{title}</h2>
          <button type="button" className="slideover__close" onClick={onClose}>✕</button>
        </div>
        <div className="slideover__body">{children}</div>
      </div>
    </div>
  );
}
