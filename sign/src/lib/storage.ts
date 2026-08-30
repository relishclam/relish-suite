import { supabase } from './supabase';
import { PDFDocument } from 'pdf-lib';

const BUCKET = 'relish-sign-docs';

/** Uploads a file to Supabase Storage and returns the storage path. */
export async function uploadFile(
  file: File | Blob,
  path: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file instanceof File ? file.type : 'application/octet-stream',
  });
  if (error) throw error;
  return path;
}

/** Uploads the seal PNG to relish-sign-docs/seals/ and returns the path. */
export async function uploadSeal(sealBlob: Blob, signatureId: string): Promise<string> {
  const path = `seals/${signatureId}.png`;
  return uploadFile(sealBlob, path);
}

/** Uploads a quick-sign file and returns the storage path. */
export async function uploadQuickSign(file: File, userId: string): Promise<string> {
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `quick-sign/${userId}/${ts}-${safeName}`;
  return uploadFile(file, path);
}

/** Stamps a PDF with the seal image and uploads the result. Returns the sealed path. */
export async function stampAndUpload(
  pdfPath: string,
  sealBlob: Blob,
  signatureId: string,
  position: 'bottom-right' | 'bottom-left' = 'bottom-right',
): Promise<string> {
  // Download original PDF
  const { data: pdfData, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(pdfPath);
  if (dlErr || !pdfData) throw dlErr ?? new Error('PDF download failed');

  const pdfBytes = await pdfData.arrayBuffer();
  const stamped = await stampPDF(pdfBytes, sealBlob, position);

  const sealedPath = `sealed/${signatureId}.pdf`;
  await uploadFile(new Blob([stamped.buffer as ArrayBuffer], { type: 'application/pdf' }), sealedPath);
  return sealedPath;
}

export async function stampPDF(
  pdfBytes: ArrayBuffer,
  sealBlob: Blob,
  position: 'bottom-right' | 'bottom-left' = 'bottom-right',
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const sealBytes = new Uint8Array(await sealBlob.arrayBuffer());
  const sealImage = await pdfDoc.embedPng(sealBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();
  const sealW = 160, sealH = 80, margin = 20;
  const x = position === 'bottom-right' ? width - sealW - margin : margin;
  lastPage.drawImage(sealImage, { x, y: margin, width: sealW, height: sealH });
  return pdfDoc.save();
}

