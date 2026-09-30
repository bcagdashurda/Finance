import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Adresteki bir bayrağı (ör. /hesaplar?yeni=1) bir kez tüketip eylemi çalıştırır.
 * Başka sayfalardan "hesap ekle", "içe aktar" gibi derin bağlantılar için.
 */
export function useParamAction(name: string, action: () => void): void {
  const [params, setParams] = useSearchParams();
  const actionRef = useRef(action);
  actionRef.current = action;
  const present = params.has(name);
  useEffect(() => {
    if (!present) return;
    actionRef.current();
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true },
    );
  }, [present, name, setParams]);
}
