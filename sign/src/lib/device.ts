/** Device detection — determines whether to sign locally or via desktop QR flow. */

export function isMobileDevice(): boolean {
  const mobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
  const hasTouch = navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth <= 1024;
  return mobileUA || (hasTouch && isNarrow);
}

/** True only if device is mobile AND WebAuthn is available. Desktop always returns false. */
export function canSignLocally(): boolean {
  if (!isMobileDevice()) return false;
  if (!window.PublicKeyCredential) return false;
  return true;
}
