import {
  Bank,
  Briefcase,
  Buildings,
  Car,
  Cloud,
  CreditCard,
  DotsThree,
  ForkKnife,
  Globe,
  Handshake,
  Lightning,
  Megaphone,
  Package,
  Paperclip,
  Percent,
  PlusCircle,
  Receipt,
  Scales,
  Shield,
  Storefront,
  Truck,
  Users,
  Wrench,
  Wallet,
  Vault,
  CreditCard as Card,
  ChartLineUp,
  CashRegister,
  type Icon,
} from '@phosphor-icons/react';
import type { AccountKind } from '@/domain/types';

const CATEGORY_ICONS: Record<string, Icon> = {
  storefront: Storefront,
  globe: Globe,
  handshake: Handshake,
  percent: Percent,
  'plus-circle': PlusCircle,
  package: Package,
  users: Users,
  bank: Bank,
  buildings: Buildings,
  lightning: Lightning,
  truck: Truck,
  wrench: Wrench,
  receipt: Receipt,
  scales: Scales,
  'credit-card': CreditCard,
  briefcase: Briefcase,
  car: Car,
  'fork-knife': ForkKnife,
  paperclip: Paperclip,
  cloud: Cloud,
  megaphone: Megaphone,
  shield: Shield,
  dots: DotsThree,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function CategoryIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const I = CATEGORY_ICONS[name] ?? DotsThree;
  return <I size={size} className={className} aria-hidden />;
}

const ACCOUNT_ICONS: Record<AccountKind, Icon> = {
  bank: Bank,
  cash: Wallet,
  card: Card,
  pos: CashRegister,
  investment: ChartLineUp,
  other: Vault,
};

export function AccountIcon({ kind, size = 16, className }: { kind: AccountKind; size?: number; className?: string }) {
  const I = ACCOUNT_ICONS[kind];
  return <I size={size} className={className} aria-hidden />;
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Banka hesabı',
  cash: 'Kasa',
  card: 'Kredi kartı',
  pos: 'POS / sanal POS',
  investment: 'Yatırım hesabı',
  other: 'Diğer',
};
