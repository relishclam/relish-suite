/** All Web Crypto operations for Relish Sign. Private key never leaves the device. */

function hexToBytes(hex: string): ArrayBuffer {
  const buffer = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buffer;
}

export async function generateKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,              // extractable: false — private key never leaves device
    ['sign', 'verify'],
  );
  const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { publicKeyJwk, privateKey: keyPair.privateKey };
}

export async function signHash(documentHash: string, privateKey: CryptoKey): Promise<string> {
  const hashBytes = hexToBytes(documentHash);
  const signatureBuffer = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    hashBytes,
  );
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

export async function verifySignature(
  documentHash: string,
  signatureBase64: string,
  publicKeyJwk: JsonWebKey,
): Promise<boolean> {
  const publicKey = await window.crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const hashBytes = hexToBytes(documentHash);
  const sigBytes = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));
  return window.crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sigBytes,
    hashBytes,
  );
}

export async function hashFile(file: File | ArrayBuffer): Promise<string> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
