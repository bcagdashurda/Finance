import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  CaretLineLeft,
  CaretLineRight,
  DotsThreeOutline,
  MagnifyingGlass,
  Moon,
  Plus,
  Sparkle,
  Sun,
  Circle,
  Warning,
} from '@phosphor-icons/react';
import { cn } from '@/ui/cn';
import { LogoMark, Wordmark } from '@/ui/Logo';
import { Button, IconButton } from '@/ui/Button';
import { Kbd, MOD_KEY, Tip } from '@/ui/bits';
import { Sheet } from '@/ui/Overlay';
import { useMediaQuery } from '@/ui/useMediaQuery';
import { formatShort } from '@/domain/money';
import { useFinance } from './finance';
import { NAV, SETTINGS_ITEM, type NavItem } from './nav';
import { useUI } from './ui-store';
import { CommandPalette } from './CommandPalette';
import { EntrySheet } from '@/features/entry/EntrySheet';
import { AssistantDrawer } from '@/features/asistan/AssistantDrawer';
import { TrialDialog } from '@/features/ayarlar/TrialDialog';
import { useShortcuts } from './shortcuts';
import { formatDayMonth } from '@/ui/format';
import { fetchLatestRates } from '@/data/rates';
import { CloudBridge } from '@/cloud/CloudBridge';
import { CloudStatusBadge } from '@/cloud/ui';
import { DemoBanner } from './DemoBanner';
import { cloudAvailable } from '@/features/ayarlar/CloudSection';
import { ensurePersistentStorage } from '@/data/persist';
import { prefetchPages } from './pages';

function RailLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      viewTransition
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-[12px] px-3 text-sm transition-colors',
          isActive ? 'text-ink' : 'text-muted hover:text-ink',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="rail-active"
              className="absolute inset-0 -z-10 rounded-[12px] bg-surface shadow-[0_1px_2px_rgb(15_26_61/0.06),0_0_0_1px_var(--line)]"
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            />
          )}
          {isActive && (
            <motion.span
              layoutId="rail-tick"
              className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-cobalt"
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            />
          )}
          <Icon size={19} weight={isActive ? 'fill' : 'regular'} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
          {!collapsed && <span className="truncate font-medium">{item.label}</span>}
          {collapsed && <span className="sr-only">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

function ThemeButton() {
  const { theme, setTheme } = useUI();
  const next = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  const label = theme === 'system' ? 'Tema: sistem' : theme === 'dark' ? 'Tema: koyu' : 'Tema: açık';
  return (
    <Tip content={`${label} · değiştir`}>
      <IconButton label={label} size="sm" onClick={() => setTheme(next)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="inline-flex"
          >
            {theme === 'dark' ? <Moon size={16} /> : theme === 'light' ? <Sun size={16} /> : <Circle size={16} weight="duotone" />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
    </Tip>
  );
}

function Rail() {
  const { railPref, setRailCollapsed, setAssistantOpen } = useUI();
  // 1024–1279 px'te 244 px'lik menü içeriği ~716 px'e sıkıştırıyordu (Kokpit rakamı kesik, cari adları görünmez):
  // kullanıcı açıkça seçmediyse orada dar menü
  const wide = useMediaQuery('(min-width: 1280px)');
  const collapsed = railPref ? railPref === 'collapsed' : !wide;
  const toggleRail = () => setRailCollapsed(!collapsed);
  const f = useFinance();
  return (
    <aside
      className={cn(
        'sticky top-0 z-20 hidden h-dvh shrink-0 flex-col border-r border-line bg-ground-2/60 px-3 pb-4 pt-5 backdrop-blur-sm transition-[width] duration-300 lg:flex',
        collapsed ? 'w-[76px]' : 'w-[244px]',
      )}
      aria-label="Ana gezinme"
    >
      <div className={cn('mb-7 flex items-center gap-2.5 px-2', collapsed && 'justify-center px-0')}>
        <LogoMark size={30} />
        {!collapsed && (
          <div className="min-w-0">
            <Wordmark />
            <div className="mt-1 truncate text-2xs text-muted">{f.workspace.name}</div>
          </div>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.label}>
            {!collapsed && <div className="mb-1.5 px-3 text-2xs font-medium text-faint">{group.label}</div>}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <RailLink key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 space-y-0.5 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className={cn(
            'group flex h-10 w-full items-center gap-3 rounded-[12px] px-3 text-sm text-muted transition-colors hover:text-ink',
            collapsed && 'justify-center px-0',
          )}
        >
          <Sparkle size={19} weight="duotone" className="shrink-0 text-cobalt transition-transform duration-500 group-hover:rotate-90" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left font-medium">Asistan</span>
              <Kbd>{MOD_KEY} J</Kbd>
            </>
          )}
          {collapsed && <span className="sr-only">Asistan</span>}
        </button>
        <RailLink item={SETTINGS_ITEM} collapsed={collapsed} />
        <div className={cn('flex items-center gap-1 pt-2', collapsed ? 'flex-col' : 'justify-between px-1')}>
          {/* Bulut kurulmamışsa eşitleme bölümü yok: rozet yedek bölümüne götürür */}
          <NavLink to={cloudAvailable(f.settings.cloud) ? '/ayarlar#bulut' : '/ayarlar#veri'} viewTransition aria-label="Veri ve eşitleme durumu">
            <CloudStatusBadge linked={Boolean(f.settings.cloud?.linked.includes(f.workspace.id)) && !f.settings.isDemo} collapsed={collapsed} />
          </NavLink>
          <div className={cn('flex items-center', collapsed && 'flex-col')}>
            <ThemeButton />
            <IconButton label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'} size="sm" onClick={toggleRail}>
              {collapsed ? <CaretLineRight size={16} /> : <CaretLineLeft size={16} />}
            </IconButton>
          </div>
        </div>
      </div>
    </aside>
  );
}

function AlertsButton() {
  const f = useFinance();
  const navigate = useNavigate();
  const alert = f.forecast.alerts[0];
  const overdue = [...f.docStates.values()].filter((s) => s.status === 'overdue').length;
  const count = (alert ? 1 : 0) + (overdue > 0 ? 1 : 0);
  return (
    <Tip
      content={
        alert
          ? `${formatDayMonth(alert.date)} günü nakit ${formatShort(alert.value)} seviyesine iniyor`
          : overdue
            ? `${overdue} gecikmiş belge var`
            : 'Uyarı yok'
      }
    >
      <IconButton label="Uyarılar" size="md" onClick={() => navigate('/akis', { viewTransition: true })} className="relative">
        {alert ? <Warning size={18} className="text-saffron-text" /> : <Bell size={18} />}
        {count > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-outflow ring-2 ring-[var(--ground)]" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-outflow opacity-60" />
          </span>
        )}
      </IconButton>
    </Tip>
  );
}

function TopBar() {
  const { setPaletteOpen, openEntry } = useUI();
  return (
    <div className="sticky top-0 z-10 border-b border-transparent bg-[color-mix(in_oklab,var(--ground)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-2 lg:hidden">
          <LogoMark size={26} />
          <Wordmark className="text-lg" />
        </div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="group ml-auto flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-line bg-surface/70 px-3.5 text-left text-sm text-muted transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_4px_18px_-10px_var(--cobalt)] sm:max-w-md lg:ml-0"
        >
          <MagnifyingGlass size={16} className="shrink-0" />
          <span className="truncate">
            <span className="hidden sm:inline">Ara, git ya da yaz: </span>
            <span className="text-faint">“Yıldız'dan 45 bin tahsilat”</span>
          </span>
          <Kbd className="ml-auto hidden sm:inline-flex">{MOD_KEY} K</Kbd>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <AlertsButton />
          <div className="hidden sm:block">
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => openEntry({ kind: 'collect' })}>
              Kayıt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOBILE_TABS: NavItem[] = [NAV[0]!.items[0]!, NAV[0]!.items[1]!, NAV[1]!.items[0]!];

function MobileBar() {
  const { openEntry } = useUI();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  const rest = [...NAV.flatMap((g) => g.items).filter((i) => !MOBILE_TABS.includes(i)), SETTINGS_ITEM];
  return (
    <>
      <nav
        aria-label="Alt gezinme"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-lg lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {MOBILE_TABS.slice(0, 2).map((item) => (
            <MobileTab key={item.to} item={item} />
          ))}
          <div className="flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => openEntry({ kind: 'collect' })}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-cobalt text-inverse shadow-[0_10px_24px_-10px_var(--cobalt)]"
              aria-label="Yeni kayıt"
            >
              <Plus size={22} weight="bold" />
            </motion.button>
          </div>
          <MobileTab item={MOBILE_TABS[2]!} />
          <button type="button" onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 text-2xs text-muted">
            <DotsThreeOutline size={22} />
            Daha fazla
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title="Menü">
        <div className="grid grid-cols-2 gap-2">
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} viewTransition className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-4 text-sm font-medium">
                <Icon size={20} className="text-cobalt" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function MobileTab({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.to === '/'} viewTransition className={({ isActive }) => cn('flex flex-col items-center gap-0.5 text-2xs', isActive ? 'text-cobalt' : 'text-muted')}>
      {({ isActive }) => (
        <>
          <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
          {item.label.split(' ')[0]}
        </>
      )}
    </NavLink>
  );
}

/** Kur güncellemesi işletme + gün başına bir kez denenir (demodan çıkınca yeni işletme için tekrar). */
let ratesCheckedFor: string | null = null;

export function AppShell() {
  useShortcuts();
  const location = useLocation();
  const f = useFinance();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  // Günlük kur güncellemesi (çevrimdışıysa son bilinen kur kullanılır)
  useEffect(() => {
    const key = `${f.workspace.id}:${f.today}`;
    if (ratesCheckedFor === key || f.ratesDate === f.today) return;
    ratesCheckedFor = key;
    fetchLatestRates().catch(() => undefined);
  }, [f.ratesDate, f.today, f.workspace.id]);
  // Gerçek işletme verisi varken tarayıcıdan kalıcı depolama iste (defter ve anahtar silinmesin)
  useEffect(() => {
    if (!f.settings.isDemo) void ensurePersistentStorage();
  }, [f.settings.isDemo]);
  // Diğer sayfaların kodunu boşta indir: ilk geçişte ağ beklenmesin
  useEffect(() => prefetchPages(), []);
  return (
    <div className="grain relative flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        İçeriğe geç
      </a>
      <div className="no-print contents">
        <Rail />
      </div>
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div className="no-print sticky top-0 z-10">
          <TopBar />
        </div>
        <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-10 lg:pb-16">
          <div className="no-print">
            <DemoBanner />
          </div>
          <Outlet />
        </main>
      </div>
      <div className="no-print">
        <MobileBar />
      </div>
      <CommandPalette />
      <EntrySheet />
      <AssistantDrawer />
      <TrialDialog />
      <CloudBridge />
    </div>
  );
}
