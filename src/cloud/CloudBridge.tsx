import { useEffect } from 'react';
import { useFinance } from '@/app/finance';
import { db, WORKSPACE_TABLES } from '@/data/db';
import { ensureClient, envCloudConfig, isApplyingRemote, syncNow, useCloud } from './store';

const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 4_000;

let hooked = false;
let notify: () => void = () => undefined;

/** Yerel her değişiklikte (senkronun kendi yazdıkları hariç) senkron planla. */
function hookChanges() {
  if (hooked) return;
  hooked = true;
  const fire = () => {
    if (!isApplyingRemote()) notify();
  };
  for (const t of [...WORKSPACE_TABLES, 'workspaces'] as const) {
    const table = db[t] as unknown as { hook(ev: string, fn: () => void): void };
    table.hook('creating', fire);
    table.hook('updating', fire);
    table.hook('deleting', fire);
  }
}

/** Uygulama kabuğunda yaşayan görünmez köprü: istemci, oturum ve otomatik senkron. */
export function CloudBridge() {
  const f = useFinance();
  const cfg = f.settings.cloud;
  const session = useCloud((s) => s.session);
  const wsId = f.workspace.id;
  const linked = Boolean(cfg?.linked.includes(wsId)) && !f.settings.isDemo;

  useEffect(() => {
    const source = cfg?.url && cfg.anonKey ? cfg : envCloudConfig();
    ensureClient(source ?? null);
  }, [cfg?.url, cfg?.anonKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session || !linked) return;
    hookChanges();
    let timer: number | undefined;
    notify = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void syncNow(wsId), DEBOUNCE_MS);
    };
    void syncNow(wsId);
    const interval = window.setInterval(() => void syncNow(wsId), INTERVAL_MS);
    const onFocus = () => void syncNow(wsId);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      notify = () => undefined;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [session, linked, wsId]);

  return null;
}
