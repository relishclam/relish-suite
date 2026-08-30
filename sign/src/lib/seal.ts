/**
 * Seal renderer — produces the 320×160 Relish Sign visual seal as a PNG Blob.
 * Rendered at 2× (640×320) for retina displays.
 * Logo loaded from /Relish-Logo.png (Vite public folder — no processing).
 */

export interface SealData {
  signerName: string; // "MOTTY PHILIP"
  sealId: string;     // "RSG-0047 · a3f7c92d"
  signedAt: Date;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function formatIST(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '  ') + ' IST';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function renderSeal(data: SealData): Promise<Blob> {
  const W = 320, H = 160, SCALE = 2;
  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, 0, 0, W, H, 8);
  ctx.fill();

  // Border — Relish Purple
  ctx.strokeStyle = '#6B21A8';
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 7);
  ctx.stroke();

  // Logo — actual Relish-Logo.png from public folder
  const logo = await loadImage('/Relish-Logo.png');
  const logoH = 48;
  const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
  ctx.drawImage(logo, (W - logoW) / 2, 8, logoW, logoH);

  // Divider 1 — Teal
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 62);
  ctx.lineTo(W - 16, 62);
  ctx.stroke();

  // Signer name — Purple bold ALL CAPS
  ctx.fillStyle = '#6B21A8';
  ctx.font = 'bold 13px "DM Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.signerName.toUpperCase(), W / 2, 80);

  // "Digitally Signed" — Teal (mandatory, replaces role)
  ctx.fillStyle = '#2DD4BF';
  ctx.font = '11px "DM Sans", Arial, sans-serif';
  ctx.fillText('Digitally Signed', W / 2, 96);

  // Divider 2 — Teal
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 106);
  ctx.lineTo(W - 16, 106);
  ctx.stroke();

  // Seal ID — Orange monospace
  ctx.fillStyle = '#EA580C';
  ctx.font = '10px "DM Mono", "Courier New", monospace';
  ctx.fillText(data.sealId, W / 2, 122);

  // Date/Time — Dark grey
  ctx.fillStyle = '#374151';
  ctx.font = '10px "DM Sans", Arial, sans-serif';
  ctx.fillText(formatIST(data.signedAt), W / 2, 138);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0),
  );
}
