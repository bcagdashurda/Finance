import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowsLeftRight, ArrowCounterClockwise, PencilSimple, Plus, Archive } from '@phosphor-icons/react';
import { Modal } from '@/ui/Overlay';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button, IconButton } from '@/ui/Button';
import { Money } from '@/ui/Money';
import { Segmented } from '@/ui/Segmented';
import { AccountIcon, ACCOUNT_KIND_LABEL } from '@/ui/icons';
import { slotColor } from '@/ui/cn';
import { BalanceArea } from '@/charts/BalanceArea';
import { FlowBars } from '@/charts/FlowBars';
import { balanceSeries, transactionEffect } from '@/domain/balances';
import { addDays, addMonths, monthKey, startOfMonth } from '@/domain/dates';
import type { MonthFlow } from '@/domain/aggregate';
import { formatIban } from '@/domain/validators';
import { deleteOrArchiveAccount, updateAccount } from '@/data/repo';
import { TransactionRow } from '@/features/islemler/TransactionRow';
import { AccountSheet } from './AccountSheet';

export default function HesapDetayPage() {
  const { id = '' } = useParams();
  const f = useFinance();
  const navigate = useNavigate();
  const openEntry = useUI((s) => s.openEntry);
  const [range, setRange] = useState<'90' | '180' | '365'>('180');
  const [edit, setEdit] = useState(false);
  const [limit, setLimit] = useState(60);
  const [removeOpen, setRemoveOpen] = useState(false);
  const a = f.accountsById.get(id);
  /** deleteOrArchiveAccount ile aynı ölçüt: bağlı kayıt varsa arşivlenir. */
  const linked =
    f.transactions.some((t) => t.accountId === id || t.toAccountId === id) || f.recurring.some((r) => r.accountId === id) || f.instruments.some((i) => i.accountId === id);

  const points = useMemo(() => (a ? balanceSeries([a], f.transactions, addDays(f.today, -Number(range)), f.today, { ...f.rates, [a.currency]: 1 }) : []), [a, f.transactions, f.today, f.rates, range]);
  const txs = useMemo(() => f.transactionsDesc.filter((t) => t.accountId === id || t.toAccountId === id), [f.transactionsDesc, id]);
  const months = useMemo<MonthFlow[]>(() => {
    const out = new Map<string, MonthFlow>();
    for (let m = startOfMonth(addMonths(f.today, -11)); m <= f.today; m = addMonths(m, 1)) out.set(monthKey(m), { key: monthKey(m), inflow: 0, outflow: 0, net: 0 });
    for (const t of txs) {
      const row = out.get(monthKey(t.date));
      if (!row) continue;
      const e = transactionEffect(t, id);
      if (e > 0) row.inflow += e;
      else row.outflow += -e;
      row.net = row.inflow - row.outflow;
    }
    return [...out.values()];
  }, [txs, f.today, id]);

  if (!a) {
    return (
      <div className="py-24 text-center text-sm text-muted">
        Hesap bulunamadı.{' '}
        <Link to="/hesaplar" className="text-cobalt-ink underline">
          Hesaplara dön
        </Link>
      </div>
    );
  }
  const bal = f.balances.get(a.id) ?? 0;

  return (
    <div>
      <Link to="/hesaplar" viewTransition className="mb-4 inline-flex items-center gap-1.5 pt-3 text-xs text-muted hover:text-ink">
        <ArrowLeft size={14} /> Hesaplar
      </Link>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-[18px]"
            style={{ color: slotColor(a.color), background: `color-mix(in oklab, ${slotColor(a.color)} 14%, transparent)`, viewTransitionName: `account-${a.id}` }}
          >
            <AccountIcon kind={a.kind} size={30} />
          </span>
          <div>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="display text-3xl font-semibold sm:text-4xl">
              {a.name}
            </motion.h1>
            <div className="mt-1 text-xs text-muted">
              {a.institution ?? ACCOUNT_KIND_LABEL[a.kind]} · {a.currency}
              {a.iban && <span className="num"> · {formatIban(a.iban)}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<ArrowsLeftRight size={16} />} onClick={() => openEntry({ kind: 'transfer', accountId: a.id })}>
            Transfer
          </Button>
          <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => openEntry({ kind: 'expense', accountId: a.id })}>
            İşlem
          </Button>
          <IconButton label="Düzenle" variant="secondary" onClick={() => setEdit(true)}>
            <PencilSimple size={16} />
          </IconButton>
          <IconButton
            label={a.archived ? 'Arşivden çıkar' : 'Arşivle ya da sil'}
            variant="secondary"
            onClick={async () => {
              if (!a.archived) return setRemoveOpen(true);
              await updateAccount(a.id, { archived: false });
              toast.success('Hesap yeniden etkin');
            }}
          >
            {a.archived ? <ArrowCounterClockwise size={16} /> : <Archive size={16} />}
          </IconButton>
        </div>
      </header>

      <Modal
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={linked ? 'Hesap arşivlensin mi?' : 'Hesap silinsin mi?'}
        description={
          linked
            ? 'Bu hesabın hareketleri olduğu için silinmez, arşivlenir: toplam bakiyeye ve projeksiyona katılmaz, seçimlerde görünmez; geçmiş kayıtlar korunur.'
            : 'Bu hesaba bağlı hiçbir kayıt yok; kalıcı olarak silinir.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant={linked ? 'primary' : 'danger'}
              onClick={async () => {
                const r = await deleteOrArchiveAccount(a.id);
                setRemoveOpen(false);
                toast.success(r === 'deleted' ? 'Hesap silindi' : 'Hesap arşivlendi');
                if (r === 'deleted') navigate('/hesaplar', { viewTransition: true });
              }}
            >
              {linked ? 'Arşivle' : 'Evet, sil'}
            </Button>
          </>
        }
      >
        <span />
      </Modal>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel reveal={0}>
          <PanelHeader
            title="Bakiye"
            description={
              <span>
                Bugün <Money value={bal} currency={a.currency} className="font-semibold text-ink" />
              </span>
            }
            actions={<Segmented label="Aralık" size="sm" value={range} onChange={setRange} options={[{ value: '90', label: '3 ay' }, { value: '180', label: '6 ay' }, { value: '365', label: '1 yıl' }]} />}
          />
          <BalanceArea key={range} label="Hesap bakiyesi" points={points} currency={a.currency} color={slotColor(a.color)} minLine={a.minBalance} height={280} />
        </Panel>
        <Panel reveal={1}>
          <PanelHeader title="Aylık giriş ve çıkış" description="Transferler dahil, bu hesaba etkisiyle" />
          <FlowBars label="Hesabın aylık giriş ve çıkışları" months={months} height={260} />
        </Panel>
      </div>

      <Panel reveal={2} className="mt-5" padded={false}>
        <div className="px-6 pt-5">
          <PanelHeader title="Hareketler" description={`${txs.length} işlem`} />
        </div>
        <ul className="px-3 pb-4">
          {txs.slice(0, limit).map((t) => (
            <TransactionRow key={t.id} t={t} accountId={a.id} />
          ))}
        </ul>
        {txs.length > limit && (
          <div className="flex justify-center pb-5">
            <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + 120)}>
              Daha fazla göster
            </Button>
          </div>
        )}
      </Panel>
      <AccountSheet open={edit} onOpenChange={setEdit} account={a} />
    </div>
  );
}
