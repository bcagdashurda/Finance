/**
 * Ayın Hikâyesi — sinematik scrollytelling (epic-design teknikleri):
 * derinlik katmanlı paralaks kapak, scrub'lı sayaçlar, kelime kelime aydınlanan
 * anlatı, perde (clip) ile açılan çubuklar, iki yandan birleşen kartlar ve
 * kaydırmayla çizilen projeksiyon eğrisi. prefers-reduced-motion'da statik.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDown, ArrowRight, Printer, Sparkle } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useAi } from '@/ai/useAi';
import { Segmented } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { CategoryIcon } from '@/ui/icons';
import { prefersReducedMotion, slotColor } from '@/ui/cn';
import { formatDayMonthLong, formatMonth, formatMonthShort, percent } from '@/ui/format';
import { ringPath } from '@/charts/guilloche';
import { addMonths, monthKey } from '@/domain/dates';
import { formatMoney, formatShort } from '@/domain/money';
import { buildStory, type StoryData } from './story-data';

gsap.registerPlugin(ScrollTrigger);

const fmt = (v: number) => formatMoney(Math.round(v), 'TRY', { decimals: 0 });

function Words({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`story-words ${className ?? ''}`}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="w inline-block">
          {w}&nbsp;
        </span>
      ))}
    </p>
  );
}

export default function HikayePage() {
  const f = useFinance();
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => monthKey(addMonths(`${monthKey(f.today)}-01`, -i))), [f.today]);
  // Varsayılan: son tamamlanmış ay (ayın ilk haftasındaysak) ya da içinde bulunulan ay
  const [month, setMonth] = useState(Number(f.today.slice(8, 10)) < 8 ? months[1]! : months[0]!);
  const data = useMemo(() => buildStory(f, month), [f, month]);
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-10 print:mx-0">
      <div className="no-print sticky top-16 z-20 flex justify-center px-4 pb-2 pt-3">
        <Segmented label="Ay" size="sm" value={month} onChange={setMonth} options={[...months].reverse().map((m) => ({ value: m, label: formatMonthShort(m) }))} className="shadow-[var(--float-shadow)]" />
      </div>
      {/* Kaydırmalı anlatı kâğıda basılamaz (yapışkan bölümler, sayaç animasyonları): yazdırmada statik özet */}
      <div className="no-print">
        <Story key={month} data={data} />
      </div>
      <StoryPrint data={data} />
    </div>
  );
}

/** Yazdırma / PDF için tek sayfalık aylık özet: hikâyenin aynı rakamları, animasyonsuz. */
function StoryPrint({ data }: { data: StoryData }) {
  const f = useFinance();
  const change = data.prevNet ? (data.net - data.prevNet) / Math.abs(data.prevNet) : 0;
  const maxCat = Math.max(1, ...data.topCategories.map((c) => c.amount));
  const maxCust = Math.max(1, ...data.topCustomers.map((c) => c.amount));
  const verdict = data.alert ? 'Tahsilatları hızlandırın; sıkışma yaklaşıyor.' : data.net >= 0 ? 'Sağlıklı bir ay. Fazlayı değerlendirmeyi düşünün.' : 'Giderleri gözden geçirme zamanı.';
  return (
    <article className="print-only px-2 text-ink">
      <header className="flex items-end justify-between gap-6 border-b border-line-strong pb-3">
        <div>
          <div className="text-[9pt] text-muted">{f.workspace.legalName ?? f.workspace.name}</div>
          <h1 className="display text-[20pt] font-semibold leading-tight">
            {formatMonth(data.month).replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))} {data.month.slice(0, 4)} · aylık özet
          </h1>
        </div>
        <div className="text-right text-[8.5pt] text-muted">Hazırlanma: {formatDayMonthLong(f.today)}</div>
      </header>

      <section className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Kasaya giren', value: formatShort(data.inflow), cls: 'text-inflow-text', sub: `${data.txCount} hareket` },
          { label: 'Kasadan çıkan', value: formatShort(data.outflow), cls: 'text-outflow-text', sub: data.topCategories[0] ? `en büyük: ${data.topCategories[0].name}` : '' },
          {
            label: 'Net sonuç',
            value: `${data.net >= 0 ? '+' : '−'}${formatShort(Math.abs(data.net))}`,
            cls: data.net >= 0 ? 'text-inflow-text' : 'text-outflow-text',
            sub: data.prevNet ? `geçen aya göre ${percent(Math.abs(change))} ${change >= 0 ? 'daha iyi' : 'daha zayıf'}` : '',
          },
        ].map((k) => (
          <div key={k.label} className="rounded-[10px] border border-line p-3">
            <div className="text-[8.5pt] text-muted">{k.label}</div>
            <div className={`display mt-0.5 text-[17pt] font-semibold ${k.cls}`}>{k.value}</div>
            <div className="text-[8pt] text-muted">{k.sub}</div>
          </div>
        ))}
      </section>

      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-2 text-[10pt] font-semibold">En çok tahsilat yapılan müşteriler</h2>
          {data.topCustomers.length ? (
            <ul className="space-y-1.5 text-[9pt]">
              {data.topCustomers.map((c, i) => (
                <li key={c.id}>
                  <div className="flex justify-between gap-3">
                    <span>
                      {i + 1}. {c.name}
                    </span>
                    <span className="num">{formatShort(c.amount)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-inflow" style={{ width: `${(c.amount / maxCust) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[9pt] text-muted">Bu ay cariden tahsilat yok.</p>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-[10pt] font-semibold">En büyük gider kalemleri</h2>
          {data.topCategories.length ? (
            <ul className="space-y-1.5 text-[9pt]">
              {data.topCategories.map((c) => (
                <li key={String(c.id)}>
                  <div className="flex justify-between gap-3">
                    <span>{c.name}</span>
                    <span className="num">
                      {formatShort(c.amount)} · {percent(data.outflow ? c.amount / data.outflow : 0)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-sunken">
                    <div className="h-full rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%`, background: slotColor(c.color) }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[9pt] text-muted">Bu ay gider kaydı yok.</p>
          )}
        </div>
      </section>

      {(data.bestPayer || data.latePayer) && (
        <section className="mt-5 grid grid-cols-2 gap-6 text-[9pt]">
          {data.bestPayer && (
            <div className="rounded-[10px] border border-line p-3">
              <div className="text-[8.5pt] text-inflow-text">En güvenilir ödeyen</div>
              <div className="mt-0.5 font-semibold">{data.bestPayer.name}</div>
              <div className="text-muted">
                Ortalama {data.bestPayer.delay <= 0 ? 'vadesinde' : `${data.bestPayer.delay} gün geç`} öder; faturalarının {percent(data.bestPayer.onTime)} kadarı zamanında.
              </div>
            </div>
          )}
          {data.latePayer && (
            <div className="rounded-[10px] border border-line p-3">
              <div className="text-[8.5pt] text-outflow-text">Takip edilmesi gereken</div>
              <div className="mt-0.5 font-semibold">{data.latePayer.name}</div>
              <div className="text-muted">Ortalama {data.latePayer.delay} gün geç öder.</div>
            </div>
          )}
        </section>
      )}

      <section className="mt-5 break-inside-avoid">
        <h2 className="text-[10pt] font-semibold">Önümüzdeki 30 gün</h2>
        <p className="mt-1 text-[9pt] text-ink-2">
          {data.alert
            ? `${formatDayMonthLong(data.alert.date)} günü nakit ${formatShort(data.alert.value)} seviyesine iniyor; belirlediğiniz eşiğin altında.`
            : `En düşük nokta ${formatDayMonthLong(data.forecastMin.date)}: ${formatShort(data.forecastMin.value)}. Eşiğin üzerinde kalıyorsunuz.`}
        </p>
        <StoryCurve points={data.forecastDays} idPrefix="print" className="mt-2 h-40 w-full" />
      </section>

      <section className="mt-4 rounded-[10px] border border-line-strong p-3">
        <div className="text-[8.5pt] text-muted">Ayın kararı</div>
        <div className="display mt-0.5 text-[13pt] font-semibold">{verdict}</div>
      </section>
    </article>
  );
}

function Story({ data }: { data: StoryData }) {
  const root = useRef<HTMLDivElement>(null);
  const f = useFinance();
  const reduced = prefersReducedMotion();

  useLayoutEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      // Kapak: derinlik katmanları farklı hızlarda
      gsap.utils.toArray<HTMLElement>('[data-depth]').forEach((el) => {
        const d = Number(el.dataset.depth);
        gsap.to(el, { yPercent: -d * 14, rotate: d * 4, ease: 'none', scrollTrigger: { trigger: '#s-cover', start: 'top top', end: 'bottom top', scrub: true } });
      });
      gsap.to('#cover-title', { opacity: 0, scale: 0.9, filter: 'blur(8px)', ease: 'none', scrollTrigger: { trigger: '#s-cover', start: '35% top', end: 'bottom top', scrub: true } });

      // Sayaçlar
      gsap.utils.toArray<HTMLElement>('[data-counter]').forEach((el) => {
        const target = Number(el.dataset.counter);
        const obj = { v: 0 };
        el.textContent = fmt(0);
        gsap.to(obj, {
          v: target,
          ease: 'power1.out',
          scrollTrigger: { trigger: el.closest('section')!, start: 'top 70%', end: '30% top', scrub: 0.6 },
          onUpdate: () => {
            el.textContent = fmt(obj.v);
          },
        });
      });

      // Kelime kelime aydınlanma
      gsap.utils.toArray<HTMLElement>('.story-words').forEach((block) => {
        gsap.fromTo(block.querySelectorAll('.w'), { opacity: 0.1 }, { opacity: 1, stagger: 0.08, ease: 'none', scrollTrigger: { trigger: block.closest('section')!, start: 'top 60%', end: '45% top', scrub: true } });
      });

      // Perde ile açılan çubuklar
      gsap.utils.toArray<HTMLElement>('[data-bar]').forEach((el, i) => {
        gsap.fromTo(el, { clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0% 0 0 round 999px)', ease: 'none', scrollTrigger: { trigger: el.closest('section')!, start: `${10 + i * 4}% top`, end: `${45 + i * 4}% top`, scrub: true } });
      });

      // İki yandan birleşme
      gsap.fromTo('.from-left', { xPercent: -110, opacity: 0, rotate: -4 }, { xPercent: 0, opacity: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: '#s-payers', start: 'top 70%', end: '35% top', scrub: true } });
      gsap.fromTo('.from-right', { xPercent: 110, opacity: 0, rotate: 4 }, { xPercent: 0, opacity: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: '#s-payers', start: 'top 70%', end: '35% top', scrub: true } });

      // Net: büyük rakam yukarıdan iner
      gsap.fromTo('#net-figure', { yPercent: 60, opacity: 0, scale: 1.15 }, { yPercent: 0, opacity: 1, scale: 1, ease: 'none', scrollTrigger: { trigger: '#s-net', start: 'top 75%', end: '30% top', scrub: true } });

      // Projeksiyon eğrisi çizilir
      gsap.fromTo('#story-path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '#s-next', start: 'top 60%', end: '50% top', scrub: true } });
      gsap.fromTo('#story-area', { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: '#s-next', start: '20% top', end: '55% top', scrub: true } });
    }, root);
    return () => ctx.revert();
  }, [data, reduced]);

  const change = data.prevNet ? (data.net - data.prevNet) / Math.abs(data.prevNet) : 0;
  const monthName = formatMonth(data.month);
  const year = data.month.slice(0, 4);
  const maxCat = Math.max(1, ...data.topCategories.map((c) => c.amount));
  const maxCust = Math.max(1, ...data.topCustomers.map((c) => c.amount));

  return (
    <div ref={root} className="relative">
      {/* 1 · Kapak */}
      <section id="s-cover" className="relative h-[170vh]">
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden">
          <CoverArt />
          <div id="cover-title" className="@container relative z-10 w-full px-6 text-center">
            <p className="text-sm text-muted">{f.workspace.legalName ?? f.workspace.name}</p>
            <h1 className="display mt-3 text-[clamp(3.5rem,19cqw,11rem)] font-semibold capitalize leading-[0.85] tracking-[-0.05em] text-ink">{monthName}</h1>
            <p className="display mt-2 text-3xl text-muted">{year} · ayın hikâyesi</p>
            <p className="mt-10 inline-flex items-center gap-2 text-xs text-muted">
              <ArrowDown size={14} className="animate-bounce" /> Kaydırın
            </p>
          </div>
        </div>
      </section>

      {/* 2 · Giren */}
      <section className="relative h-[190vh]">
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center px-6 sm:px-12 lg:px-20">
          <div className="grid w-full items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-inflow-text">Kasaya giren</p>
              <div data-counter={data.inflow} className="display num-wide mt-3 text-6xl font-semibold tracking-[-0.04em] text-inflow-text sm:text-8xl">
                {fmt(data.inflow)}
              </div>
              <Words
                className="mt-8 max-w-xl text-2xl leading-snug text-ink sm:text-3xl"
                text={
                  data.topCustomers[0]
                    ? `${monthName} ayında ${data.txCount} hareket işlendi. En büyük katkı ${data.topCustomers[0].name} tarafından geldi: tek başına ${formatShort(data.topCustomers[0].amount)}.`
                    : `${monthName} ayında ${data.txCount} hareket işlendi.`
                }
              />
            </div>
            <ul className="space-y-5">
              {data.topCustomers.map((c, i) => (
                <li key={c.id}>
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      {i + 1}. {c.name}
                    </span>
                    <span className="num text-muted">{formatShort(c.amount)}</span>
                  </div>
                  <div className="h-4 rounded-full bg-sunken">
                    <div data-bar className="h-full rounded-full bg-inflow" style={{ width: `${(c.amount / maxCust) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 3 · Çıkan */}
      <section className="relative h-[190vh]">
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center px-6 sm:px-12 lg:px-20">
          <div className="grid w-full items-center gap-12 lg:grid-cols-2">
            <ul className="order-2 space-y-4 lg:order-1">
              {data.topCategories.map((c) => (
                <li key={String(c.id)} className="grid grid-cols-[160px_1fr_110px] items-center gap-3 text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <CategoryIcon name={c.icon} size={15} />
                    {c.name}
                  </span>
                  <div className="h-3.5 rounded-full bg-sunken">
                    <div data-bar className="h-full rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%`, background: slotColor(c.color) }} />
                  </div>
                  <span className="num text-right text-muted">{formatShort(c.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-medium text-outflow-text">Kasadan çıkan</p>
              <div data-counter={data.outflow} className="display num-wide mt-3 text-6xl font-semibold tracking-[-0.04em] text-outflow-text sm:text-8xl">
                {fmt(data.outflow)}
              </div>
              <Words
                className="mt-8 max-w-xl text-2xl leading-snug text-ink sm:text-3xl"
                text={
                  data.topCategories[0]
                    ? `Paranın en çok gittiği yer ${data.topCategories[0].name.toLocaleLowerCase('tr-TR')} oldu; giderlerin ${percent(data.outflow ? data.topCategories[0].amount / data.outflow : 0)} kadarı.`
                    : 'Bu ay gider kaydı yok.'
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Net */}
      <section id="s-net" className="relative h-[160vh]">
        <div className="@container sticky top-16 flex h-[calc(100dvh-4rem)] flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-muted">Ayın net sonucu</p>
          {/* Boyut kapsayıcıya göre: uzun tutarlar ("+₺1,2 milyon") hiçbir genişlikte taşmaz */}
          <div id="net-figure" className={`display num-wide mt-4 max-w-full text-[clamp(2.5rem,12.5cqw,9rem)] font-semibold leading-none tracking-[-0.05em] ${data.net >= 0 ? 'text-inflow-text' : 'text-outflow-text'}`}>
            {data.net >= 0 ? '+' : '−'}
            {formatShort(Math.abs(data.net))}
          </div>
          <Words
            className="mx-auto mt-8 max-w-2xl text-2xl leading-snug text-ink sm:text-3xl"
            text={
              data.prevNet
                ? `Geçen aya göre net sonuç ${percent(Math.abs(change))} ${change >= 0 ? 'daha iyi' : 'daha zayıf'}. ${data.net >= 0 ? 'Kasa büyüdü.' : 'Kasa eridi; önümüzdeki aya dikkat.'}`
                : data.net >= 0
                  ? 'Kasa bu ay büyüdü.'
                  : 'Kasa bu ay eridi.'
            }
          />
        </div>
      </section>

      {/* 5 · Müşteriler */}
      {(data.bestPayer || data.latePayer) && (
        <section id="s-payers" className="relative h-[160vh]">
          <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-6">
            <div className="grid w-full max-w-5xl gap-6 md:grid-cols-2">
              {data.bestPayer && (
                <div className="from-left panel p-8">
                  <p className="text-sm text-inflow-text">En güvenilir ödeyen</p>
                  <p className="display mt-3 text-4xl font-semibold leading-tight">{data.bestPayer.name}</p>
                  <p className="mt-4 text-lg text-ink-2">
                    Ortalama {data.bestPayer.delay <= 0 ? 'vadesinde' : `${data.bestPayer.delay} gün geç`} ödüyor; faturalarının {percent(data.bestPayer.onTime)} kadarını zamanında kapatıyor.
                  </p>
                </div>
              )}
              {data.latePayer && (
                <div className="from-right panel p-8">
                  <p className="text-sm text-outflow-text">Takip edilmesi gereken</p>
                  <p className="display mt-3 text-4xl font-semibold leading-tight">{data.latePayer.name}</p>
                  <p className="mt-4 text-lg text-ink-2">Ortalama {data.latePayer.delay} gün geç ödüyor. Vadeyi kısaltmayı ya da çekle çalışmayı düşünün.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 6 · Önümüzdeki ay */}
      <section id="s-next" className="relative h-[180vh]">
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] flex-col justify-center px-6 sm:px-12 lg:px-20">
          <p className="text-sm text-cobalt-ink">Önümüzdeki 30 gün</p>
          <Words
            className="mt-3 max-w-3xl text-2xl leading-snug text-ink sm:text-4xl"
            text={
              data.alert
                ? `${formatDayMonthLong(data.alert.date)} günü nakit ${formatShort(data.alert.value)} seviyesine iniyor. Bu, belirlediğiniz eşiğin altında.`
                : `En düşük nokta ${formatDayMonthLong(data.forecastMin.date)}: ${formatShort(data.forecastMin.value)}. Eşiğin üzerinde kalıyorsunuz.`
            }
          />
          <StoryCurve points={data.forecastDays} />
        </div>
      </section>

      {/* 7 · Kapanış */}
      <section className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 py-20">
        <Verdict data={data} />
      </section>
    </div>
  );
}

function CoverArt() {
  const rings = useMemo(
    () =>
      Array.from({ length: 4 }, (_, layer) =>
        Array.from({ length: 5 }, (_, i) =>
          ringPath(400, 400, { radius: 120 + layer * 70 + i * 12, amplitude: 3 + layer * 1.5, lobes: 24 + layer * 8 + i * 2, phase: i * 0.5 + layer, ripple: 1, rippleLobes: 73, samples: 480 }),
        ),
      ),
    [],
  );
  const colors = ['var(--cobalt)', 'var(--inflow)', 'var(--cobalt)', 'var(--outflow)'];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {rings.map((layer, li) => (
        <svg key={li} data-depth={li} viewBox="0 0 800 800" className="absolute h-[140vmin] w-[140vmin]" style={{ opacity: 0.18 + li * 0.1 }}>
          {layer.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={colors[li]} strokeWidth={0.8} strokeOpacity={0.8} />
          ))}
        </svg>
      ))}
    </div>
  );
}

function StoryCurve({ points, idPrefix = 'story', className = 'mt-10 h-56 w-full' }: { points: Array<{ date: string; value: number }>; idPrefix?: string; className?: string }) {
  const w = 1000;
  const h = 260;
  const lo = Math.min(...points.map((p) => p.value));
  const hi = Math.max(...points.map((p) => p.value));
  const y = (v: number) => h - 20 - ((v - lo) / (hi - lo || 1)) * (h - 40);
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * w;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join('');
  const minIdx = points.findIndex((p) => p.value === lo);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-label="Önümüzdeki 30 günün nakit eğrisi">
      <defs>
        <linearGradient id={`${idPrefix}-grad`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--cobalt)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--cobalt)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path id={`${idPrefix}-area`} d={`${d}L${w} ${h}L0 ${h}Z`} fill={`url(#${idPrefix}-grad)`} />
      <path id={`${idPrefix}-path`} d={d} fill="none" stroke="var(--cobalt)" strokeWidth={3} vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeLinecap="round" />
      {minIdx >= 0 && <circle cx={x(minIdx)} cy={y(lo)} r={7} fill="var(--surface)" stroke="var(--outflow)" strokeWidth={3} />}
    </svg>
  );
}

function Verdict({ data }: { data: StoryData }) {
  const ai = useAi();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const facts = [
    { title: 'Giren', body: formatShort(data.inflow) },
    { title: 'Çıkan', body: formatShort(data.outflow) },
    { title: 'Net', body: formatShort(data.net) },
    { title: 'En büyük müşteri', body: data.topCustomers[0]?.name ?? '—' },
    { title: 'En büyük gider', body: data.topCategories[0] ? `${data.topCategories[0].name} ${formatShort(data.topCategories[0].amount)}` : '—' },
    { title: 'Önümüzdeki 30 gün en düşük nakit', body: `${formatDayMonthLong(data.forecastMin.date)} ${formatShort(data.forecastMin.value)}` },
    ...(data.latePayer ? [{ title: 'Geç ödeyen', body: `${data.latePayer.name}, ortalama ${data.latePayer.delay} gün` }] : []),
  ];
  return (
    <div className="panel mx-auto w-full max-w-3xl p-8 text-center sm:p-12">
      <p className="text-sm text-muted">Ayın kararı</p>
      <p className="display mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
        {data.alert ? 'Tahsilatları hızlandırın; sıkışma yaklaşıyor.' : data.net >= 0 ? 'Sağlıklı bir ay. Fazlayı değerlendirmeyi düşünün.' : 'Giderleri gözden geçirme zamanı.'}
      </p>
      {text && <p className="mx-auto mt-6 max-w-xl whitespace-pre-line text-left text-base leading-relaxed text-ink-2">{text}</p>}
      <div className="no-print mt-8 flex flex-wrap justify-center gap-2">
        {ai.enabled && (
          <Button
            variant="secondary"
            icon={<Sparkle size={16} weight="duotone" />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setText(await ai.narrate(facts, 'ay'));
              } finally {
                setBusy(false);
              }
            }}
          >
            Yapay zekâ yorumu
          </Button>
        )}
        <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
          Yazdır
        </Button>
        <Link to="/akis" viewTransition>
          <Button variant="primary" trailing={<ArrowRight size={16} />}>
            Nakit akışına git
          </Button>
        </Link>
      </div>
    </div>
  );
}
