/** Ayar anahtarları (settings tablosu). */
export const SETTINGS_KEYS = {
  activeWorkspace: 'activeWorkspaceId',
  minCashBalance: 'minCashBalance',
  demo: 'isDemo',
  tempo: 'forecastTempo',
  ai: 'ai',
  lock: 'appLock',
  lastBackup: 'lastBackupAt',
  cloud: 'cloud',
} as const;

/** Çalışma alanına ait senkron durum anahtarı. */
export const syncStateKey = (workspaceId: string) => `sync:${workspaceId}`;
