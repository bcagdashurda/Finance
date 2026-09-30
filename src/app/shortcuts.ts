import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useUI } from './ui-store';

const GO: Record<string, string> = {
  k: '/',
  a: '/akis',
  t: '/takvim',
  i: '/islemler',
  h: '/hesaplar',
  c: '/cariler',
  e: '/cekler',
  r: '/raporlar',
  s: '/ayarlar',
};

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** ⌘K palet, ⌘J asistan, N yeni kayıt, G + harf gezinme. */
export function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    let gPressed = 0;
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        ui.setAssistantOpen(!ui.assistantOpen);
        return;
      }
      if (mod || e.altKey || typing(e.target) || ui.paletteOpen || ui.entry) return;
      const key = e.key.toLocaleLowerCase('tr-TR');
      if (key === 'n') {
        e.preventDefault();
        ui.openEntry({ kind: 'collect' });
        return;
      }
      if (key === '/') {
        e.preventDefault();
        ui.setPaletteOpen(true);
        return;
      }
      if (key === 'g') {
        gPressed = Date.now();
        return;
      }
      const target = GO[key === 'ı' ? 'i' : key];
      if (gPressed && Date.now() - gPressed < 900 && target) {
        e.preventDefault();
        gPressed = 0;
        navigate(target, { viewTransition: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
