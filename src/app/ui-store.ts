import { create } from 'zustand';
import type { ISODate } from '@/domain/dates';
import type { CurrencyCode, Money } from '@/domain/money';
import type { ID } from '@/domain/types';
import type { EntryKind } from '@/domain/nlp';

export type { EntryKind };

export interface EntryDraft {
  kind: EntryKind;
  amount?: Money | null;
  currency?: CurrencyCode;
  date?: ISODate;
  dueDate?: ISODate;
  contactId?: ID;
  categoryId?: ID;
  accountId?: ID;
  toAccountId?: ID;
  description?: string;
  /** Tahsil/öde akışında önceden seçilmiş belgeler */
  documentIds?: ID[];
  /** Düzenleme modu */
  editTransactionId?: ID;
  editDocumentId?: ID;
}

export type ThemePref = 'system' | 'light' | 'dark';

interface UIState {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  entry: EntryDraft | null;
  openEntry: (draft: EntryDraft) => void;
  closeEntry: () => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  railCollapsed: boolean;
  toggleRail: () => void;
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  /** Kokpit açılış orkestrasyonu yalnızca oturumda bir kez oynasın */
  introPlayed: boolean;
  markIntroPlayed: () => void;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* depolama kapalı olabilir */
  }
};

export function applyTheme(theme: ThemePref) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export const useUI = create<UIState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  entry: null,
  openEntry: (entry) => set({ entry, paletteOpen: false }),
  closeEntry: () => set({ entry: null }),
  assistantOpen: false,
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
  railCollapsed: read('mizan:rail') === 'collapsed',
  toggleRail: () =>
    set((s) => {
      write('mizan:rail', s.railCollapsed ? null : 'collapsed');
      return { railCollapsed: !s.railCollapsed };
    }),
  theme: (read('mizan:theme') as ThemePref | null) ?? 'system',
  setTheme: (theme) => {
    write('mizan:theme', theme === 'system' ? null : theme);
    applyTheme(theme);
    set({ theme });
  },
  introPlayed: false,
  markIntroPlayed: () => set({ introPlayed: true }),
}));
