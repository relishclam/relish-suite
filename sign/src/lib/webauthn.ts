/** Shared WebAuthn constants — RP ID must be fixed across all deployments. */

export const RELISH_SIGN_ORIGIN =
  import.meta.env.VITE_APP_ORIGIN ?? 'https://sign.relishfoods.co';

// RP ID is always the canonical production hostname regardless of deployment URL.
export const RELISH_SIGN_RP_ID = new URL(RELISH_SIGN_ORIGIN).hostname;

const CRED_KEY = 'relish-sign:webauthn-cred-id';

export function storeWebAuthnCredId(id: string): void {
  localStorage.setItem(CRED_KEY, id);
}

export function loadWebAuthnCredId(): string | null {
  return localStorage.getItem(CRED_KEY);
}

export function clearWebAuthnCredId(): void {
  localStorage.removeItem(CRED_KEY);
}
