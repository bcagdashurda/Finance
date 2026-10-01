/**
 * Kalıcı depolama: tarayıcı, yer azalınca ya da site uzun süre açılmayınca site verisini silebilir
 * (defter ve yapay zekâ anahtarı dahil). İzin verilirse bu veriler yalnızca kullanıcı silerse gider.
 * Chrome/Edge sessizce karar verir; Firefox bir kez sorar.
 */
export async function ensurePersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isStoragePersistent(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
