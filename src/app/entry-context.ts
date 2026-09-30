import { useMemo } from 'react';
import { CATEGORY_KEYWORDS, type EntryContext } from '@/domain/nlp';
import type { Finance } from './finance';

export function buildEntryContext(f: Finance): EntryContext {
  return {
    today: f.today,
    contacts: f.contacts.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    categories: f.categories
      .filter((c) => !c.archived)
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        keywords: [...(CATEGORY_KEYWORDS[c.icon] ?? []), ...c.name.toLocaleLowerCase('tr-TR').split(/[\s,]+/).filter((w) => w.length > 3 && w !== 'diğer' && w !== 'gelirleri' && w !== 'giderler')],
      })),
    accounts: f.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
  };
}

export function useEntryContext(f: Finance): EntryContext {
  return useMemo(() => buildEntryContext(f), [f]);
}
