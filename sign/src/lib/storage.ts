import { supabase } from './supabase';
import { renderSeal } from './seal';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const BUCKET = 'relish-sign-docs';

// Seal dimensions on PDF (points) and on image (pixels at 2x)
const SEAL_W_PT = 160;
const SEAL_H_PT = 80;
const SEAL_MARGIN_PT = 20;
const SEAL_W_PX = 320;
const SEAL_H_PX = 160;
const SEAL_MARGIN_PX = 16;

export interface StampParams {
  documentPath: string;
  documentName: string;
  documentType: 'pdf' | 'image' | 'generated';
  sealBlob: Blob;
  signatureId: string;
  userId: string;
  sealId: string;
}

export interface StampResult {
  sealPath: string;
  sealedPath: string;
}

export async function uploadFile(file: File | Blob, path: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file instanceof File ? file.type : 'application/octet-stream',
  });
  if (error) throw error;
  return path;
}

/** Uploads seal PNG to seals/{userId}/{sealId}.png */
export async function uploadSeal(sealBlob: Blob, userId: string, sealId: string): Promise<string> {
  const safeSealId = sealId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `seals/${userId}/${safeSealId}.png`;
  return uploadFile(sealBlob, path);
}

export async function uploadQuickSign(file: File, userId: string): Promise<string> {
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `quick-sign/${userId}/${ts}-${safeName}`;
  return uploadFile(file, path);
}

/**
 * Stamps the document with the seal, uploads both assets, returns paths.
 * Sealed path: sealed/{userId}/{sealId}-{docName}.{ext}
 * Seal path:   seals/{userId}/{sealId}.png
 */
export async function stampAndUpload(params: StampParams): Promise<StampResult> {
  const { documentPath, documentName, documentType, sealBlob, userId, sealId } = params;

  const sealPath = await uploadSeal(sealBlob, userId, sealId);

  const { data: docData, error: dlErr } = await supabase.storage.from(BUCKET).download(documentPath);
  if (dlErr || !docData) throw dlErr ?? new Error('Document download failed');
  const docBytes = await docData.arrayBuffer();

  let stampedBlob: Blob;
  let ext: string;

  if (documentType === 'pdf') {
    const stamped = await stampPDF(docBytes, sealBlob);
    stampedBlob = new Blob([stamped.buffer as ArrayBuffer], { type: 'application/pdf' });
    ext = 'pdf';
  } else {
    stampedBlob = await stampImage(docBytes, sealBlob);
    ext = 'png';
  }

  const safeSealId = sealId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeDocName = documentName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sealedPath = `sealed/${userId}/${safeSealId}-${safeDocName}.${ext}`;
  await uploadFile(stampedBlob, sealedPath);

  return { sealPath, sealedPath };
}

export async function stampPDF(pdfBytes: ArrayBuffer, sealBlob: Blob): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const sealBytes = new Uint8Array(await sealBlob.arrayBuffer());
  const sealImage = await pdfDoc.embedPng(sealBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();

  // Seal — bottom-right corner
  const x = width - SEAL_W_PT - SEAL_MARGIN_PT;
  lastPage.drawImage(sealImage, { x, y: SEAL_MARGIN_PT, width: SEAL_W_PT, height: SEAL_H_PT });

  // Faint disclaimer footer at very bottom of page
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  lastPage.drawLine({
    start: { x: 0, y: 30 }, end: { x: width, y: 30 },
    thickness: 0.5,
    color: rgb(0.847, 0.706, 0.996),
    opacity: 0.6,
  });
  lastPage.drawText(
    'This document bears a Relish Group Internal Digital Signature.  ' +
    'For internal verification purposes only.  ' +
    'Not a legally recognised Digital Signature Certificate ' +
    'under the Information Technology Act, 2000.  ' +
    'Not intended for external or legal use.',
    {
      x: 20, y: 16,
      size: 7,
      font,
      color: rgb(0.769, 0.710, 0.992),
      opacity: 0.55,
      maxWidth: width - 40,
      lineHeight: 9,
    },
  );

  return pdfDoc.save();
}

function stampImage(imageBytes: ArrayBuffer, sealBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const imgUrl = URL.createObjectURL(new Blob([imageBytes]));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(imgUrl);

      const sealImg = new Image();
      const sealUrl = URL.createObjectURL(sealBlob);
      sealImg.onload = () => {
        const x = canvas.width - SEAL_W_PX - SEAL_MARGIN_PX;
        const y = canvas.height - SEAL_H_PX - SEAL_MARGIN_PX;
        ctx.drawImage(sealImg, x, y, SEAL_W_PX, SEAL_H_PX);

        // Faint disclaimer strip at very bottom
        ctx.save();
        ctx.globalAlpha = 0.30;
        ctx.fillStyle = '#C4B5FD';
        ctx.font = '11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          'Relish Group Internal Digital Signature · Internal use only · Not a legally recognised DSC under IT Act 2000',
          canvas.width / 2,
          canvas.height - 6,
        );
        ctx.restore();

        URL.revokeObjectURL(sealUrl);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
          'image/png',
        );
      };
      sealImg.onerror = () => { URL.revokeObjectURL(sealUrl); reject(new Error('Seal image load failed')); };
      sealImg.src = sealUrl;
    };
    img.onerror = () => { URL.revokeObjectURL(imgUrl); reject(new Error('Image load failed')); };
    img.src = imgUrl;
  });
}

/**
 * Re-stamps an existing signature by seal_id.
 * Call from browser console: import('/src/lib/storage.ts').then(m => m.retroactiveStamp('RSG-0001 · 017325eb'))
 */
export async function retroactiveStamp(targetSealId: string): Promise<void> {
  const { data: sig, error } = await supabase
    .from('document_signatures')
    .select('id, signer_name, seal_id, signed_at, document_path, document_name, document_type, signer_user_id')
    .eq('seal_id', targetSealId)
    .single();

  if (error || !sig) throw new Error(`Signature not found: ${targetSealId}`);

  const sealBlob = await renderSeal({
    signerName: sig.signer_name as string,
    sealId: sig.seal_id as string,
    signedAt: new Date(sig.signed_at as string),
  });

  const result = await stampAndUpload({
    documentPath: sig.document_path as string,
    documentName: sig.document_name as string,
    documentType: sig.document_type as 'pdf' | 'image' | 'generated',
    sealBlob,
    signatureId: sig.id as string,
    userId: sig.signer_user_id as string,
    sealId: sig.seal_id as string,
  });

  await supabase.from('document_signatures').update({
    seal_image_path: result.sealPath,
    sealed_doc_path: result.sealedPath,
  }).eq('id', sig.id as string);

  console.log('✅ Retroactive stamp complete for', targetSealId, result);
}

