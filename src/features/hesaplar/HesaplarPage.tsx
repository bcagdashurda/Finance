import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowsLeftRight, Plus, Archive } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { Money } from '@/ui/Money';
import { Badge } from '@/ui/bits';
import { AccountIcon, ACCOUNT_KIND_LABEL } from '@/ui/icons';
import { cn, slotColor } from '@/ui/cn';
import { percent } from '@/ui/format';
import { Sparkline } from '@/charts/Sparkline';
import { balanceSeries, amountInBase } from '@/domain/balances';
import { addDays } from '@/domain/dates';
import { CURRENCY_META, formatShort } from '@/domain/money';
import { formatIban } from '@/domain/validators';
import { AccountSheet } from './AccountSheet';

export default function HesaplarPage() {
  const f = useFinance();
  const openEntry = useUI((s) => s.openEntry);
  const [sheet, setSheet] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = f.accounts.filter((a) => showArchived || !a.archived);

  const series = useMemo(
    () => new Map(list.map((a) => [a.id, balanceSeries([a], f.transactions, addDays(f.today, -60), f.today, { ...f.rates, [a.currency]: 1 }).map((p) => p.value)])),
    [list, f.transactions, f.today, f.rates],
  );

  return (
    <div>
      <PageHeader
        kicker={[...f.byCurrency].map(([c, v]) => `${CURRENCY_META[c].symbol} ${formatShort(v, c).slice(1)}`).join(' · ')}
        title="Hesaplar"
        actions={
          <>
            {f.accounts.some((a) => a.archived) && (
              <Button variant="ghost" icon={<Archive size={16} />} onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'Arşivi gizle' : 'Arşivi göster'}
              </Button>
            )}
            <Button variant="secondary" icon={<ArrowsLeftRight size={16} />} onClick={() => openEntry({ kind: 'transfer' })}>
              Transfer
            </Button>
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => setSheet(true)}>
              Hesap
            </Button>
          </>
        }
      />

      <motion.div
        className="panel mb-5 flex flex-wrap items-end justify-between gap-4 px-6 py-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="text-xs text-muted">Toplam nakit (güncel kurla TL)</div>
          <Money value={f.totalBase} split className="display mt-1 block text-4xl" />
        </div>
        <div className="text-2xs text-muted">
          Kurlar: USD {f.rates.USD.toLocaleString('tr-TR')} · EUR {f.rates.EUR.toLocaleString('tr-TR')} {f.ratesDate && `· ${f.ratesDate}`}
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a, i) => {
          const bal = f.balances.get(a.id) ?? 0;
          const low = a.minBalance != null && bal < a.minBalance;
          const cardUse = a.kind === 'card' && a.creditLimit ? Math.max(0, -bal) / a.creditLimit : null;
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
              <Link
                to={`/hesaplar/${a.id}`}
                viewTransition
                className={cn('panel group relative block overflow-hidden p-5 pl-7 transition-transform duration-300 hover:-translate-y-0.5', a.archived && 'opacity-60')}
              >
                <span className="absolute inset-y-0 left-0 w-2" style={{ background: slotColor(a.color) }} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                      style={{ color: slotColor(a.color), background: `color-mix(in oklab, ${slotColor(a.color)} 12%, transparent)`, viewTransitionName: `account-${a.id}` }}
                    >
                      <AccountIcon kind={a.kind} size={20} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{a.name}</div>
                      <div className="truncate text-2xs text-muted">{a.institution ?? ACCOUNT_KIND_LABEL[a.kind]}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {a.currency !== 'TRY' && <Badge tone="cobalt">{a.currency}</Badge>}
                    {a.archived && <Badge tone="muted">Arşiv</Badge>}
                    {low && <Badge tone="warn">Minimumun altında</Badge>}
                  </div>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <Money value={bal} currency={a.currency} split className={cn('display block text-[1.9rem] leading-none', bal < 0 && 'text-outflow-text')} />
                    {a.currency !== 'TRY' && <div className="num mt-1 text-2xs text-muted">≈ {formatShort(amountInBase(bal, f.rates[a.currency]))}</div>}
                  </div>
                  <Sparkline values={series.get(a.id) ?? []} width={110} height={36} color={bal < 0 ? 'var(--outflow)' : slotColor(a.color)} delay={0.3 + i * 0.08} />
                </div>
                {cardUse != null && (
                  <div className="mt-4">
                    <div className="flex justify-between text-2xs text-muted">
                      <span>Limit kullanımı</span>
                      <span>{percent(cardUse)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <motion.div className={cn('h-full rounded-full', cardUse > 0.8 ? 'bg-outflow' : 'bg-cobalt')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, cardUse * 100)}%` }} transition={{ delay: 0.5, duration: 0.8 }} />
                    </div>
                  </div>
                )}
                {a.iban && <div className="num mt-4 truncate border-t border-line pt-3 text-2xs text-muted">{formatIban(a.iban)}</div>}
              </Link>
            </motion.div>
          );
        })}
        <motion.button
          type="button"
          onClick={() => setSheet(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] border-2 border-dashed border-line-strong text-sm text-muted transition-colors hover:border-cobalt/50 hover:text-ink"
        >
          <Plus size={22} />
          Hesap ekle
        </motion.button>
      </div>
      <AccountSheet open={sheet} onOpenChange={setSheet} />
    </div>
  );
}
