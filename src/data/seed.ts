import type { CategoryKind } from '@/domain/types';

export interface CategorySeed {
  key: string;
  name: string;
  kind: CategoryKind;
  /** Kategori paleti slotu: c1…c8 ya da 'other' */
  color: string;
  icon: string;
}

/**
 * Türk KOBİ'si için varsayılan kategori planı. Büyük gider kalemlerinin renk
 * slotları birbirinden farklıdır; grafiklerde yan yana gelmeleri güvenlidir.
 */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { key: 'satis', name: 'Satış gelirleri', kind: 'income', color: 'c1', icon: 'storefront' },
  { key: 'ihracat', name: 'İhracat gelirleri', kind: 'income', color: 'c7', icon: 'globe' },
  { key: 'hizmet', name: 'Hizmet gelirleri', kind: 'income', color: 'c3', icon: 'handshake' },
  { key: 'faiz', name: 'Faiz ve finansman gelirleri', kind: 'income', color: 'c6', icon: 'percent' },
  { key: 'diger-gelir', name: 'Diğer gelirler', kind: 'income', color: 'other', icon: 'plus-circle' },

  { key: 'hammadde', name: 'Hammadde ve malzeme', kind: 'expense', color: 'c1', icon: 'package' },
  { key: 'maas', name: 'Personel maaşları', kind: 'expense', color: 'c2', icon: 'users' },
  { key: 'sgk', name: 'SGK ve muhtasar', kind: 'expense', color: 'c7', icon: 'bank' },
  { key: 'kira', name: 'Kira', kind: 'expense', color: 'c3', icon: 'buildings' },
  { key: 'enerji', name: 'Elektrik, su, doğalgaz', kind: 'expense', color: 'c4', icon: 'lightning' },
  { key: 'lojistik', name: 'Lojistik ve nakliye', kind: 'expense', color: 'c5', icon: 'truck' },
  { key: 'bakim', name: 'Bakım, onarım, yatırım', kind: 'expense', color: 'c6', icon: 'wrench' },
  { key: 'kdv', name: 'KDV', kind: 'expense', color: 'c8', icon: 'receipt' },
  { key: 'vergi', name: 'Diğer vergi ve harçlar', kind: 'expense', color: 'c8', icon: 'scales' },
  { key: 'finansman', name: 'Kredi ve banka giderleri', kind: 'expense', color: 'c3', icon: 'credit-card' },
  { key: 'danismanlik', name: 'Müşavirlik ve danışmanlık', kind: 'expense', color: 'c5', icon: 'briefcase' },
  { key: 'arac', name: 'Araç ve yakıt', kind: 'expense', color: 'c2', icon: 'car' },
  { key: 'yemek', name: 'Yemek ve temsil', kind: 'expense', color: 'c4', icon: 'fork-knife' },
  { key: 'ofis', name: 'Ofis ve kırtasiye', kind: 'expense', color: 'c6', icon: 'paperclip' },
  { key: 'yazilim', name: 'Yazılım ve abonelikler', kind: 'expense', color: 'c7', icon: 'cloud' },
  { key: 'pazarlama', name: 'Pazarlama ve reklam', kind: 'expense', color: 'c5', icon: 'megaphone' },
  { key: 'sigorta', name: 'Sigorta', kind: 'expense', color: 'c3', icon: 'shield' },
  { key: 'diger-gider', name: 'Diğer giderler', kind: 'expense', color: 'other', icon: 'dots' },
];

export const ACCOUNT_COLORS = ['c1', 'c3', 'c7', 'c4', 'c5', 'c6', 'c2', 'c8'] as const;

/** Türkiye'de yaygın bankalar (hesap oluştururken öneri listesi). */
export const TURKISH_BANKS = [
  'Akbank',
  'Albaraka Türk',
  'DenizBank',
  'Fibabanka',
  'Garanti BBVA',
  'Halkbank',
  'HSBC',
  'ING',
  'İş Bankası',
  'Kuveyt Türk',
  'QNB',
  'Şekerbank',
  'TEB',
  'Türkiye Finans',
  'VakıfBank',
  'Vakıf Katılım',
  'Yapı Kredi',
  'Ziraat Bankası',
  'Ziraat Katılım',
  'Enpara',
];
