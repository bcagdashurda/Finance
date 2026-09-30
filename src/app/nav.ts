import {
  AddressBook,
  ArrowsDownUp,
  Bank,
  BookOpenText,
  CalendarDots,
  ChartLineUp,
  Gauge,
  GearSix,
  Signature,
  Waves,
  type Icon,
} from '@phosphor-icons/react';

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Genel bakış',
    items: [
      { to: '/', label: 'Kokpit', icon: Gauge, shortcut: 'G K' },
      { to: '/akis', label: 'Nakit akışı', icon: Waves, shortcut: 'G A' },
      { to: '/takvim', label: 'Ödeme takvimi', icon: CalendarDots, shortcut: 'G T' },
    ],
  },
  {
    label: 'Kayıtlar',
    items: [
      { to: '/islemler', label: 'İşlemler', icon: ArrowsDownUp, shortcut: 'G I' },
      { to: '/hesaplar', label: 'Hesaplar', icon: Bank, shortcut: 'G H' },
      { to: '/cariler', label: 'Cariler', icon: AddressBook, shortcut: 'G C' },
      { to: '/cekler', label: 'Çek ve senet', icon: Signature, shortcut: 'G E' },
    ],
  },
  {
    label: 'Analiz',
    items: [
      { to: '/raporlar', label: 'Raporlar', icon: ChartLineUp, shortcut: 'G R' },
      { to: '/hikaye', label: 'Ayın hikâyesi', icon: BookOpenText },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { to: '/ayarlar', label: 'Ayarlar', icon: GearSix };

export const ALL_NAV: NavItem[] = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];
