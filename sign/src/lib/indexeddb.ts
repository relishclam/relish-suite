import { get, set, del } from 'idb-keyval';

const PRIVATE_KEY_IDB_KEY = 'relish-sign:private-key';

/** Stores the non-extractable CryptoKey in IndexedDB (origin-scoped). */
export async function storePrivateKey(key: CryptoKey): Promise<void> {
  await set(PRIVATE_KEY_IDB_KEY, key);
}

/** Retrieves the stored private key, or null if not enrolled on this device. */
export async function loadPrivateKey(): Promise<CryptoKey | null> {
  return (await get<CryptoKey>(PRIVATE_KEY_IDB_KEY)) ?? null;
}

/** Removes the private key — use on unenroll or device wipe. */
export async function clearPrivateKey(): Promise<void> {
  await del(PRIVATE_KEY_IDB_KEY);
}
