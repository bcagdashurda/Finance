import { useEffect, useState } from 'react';
import { formatMoney, moneyParts, type CurrencyCode, type Money } from '@/domain/money';
import { cn } from './cn';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Roller({ digit, delay, ready }: { digit: number; delay: number; ready: boolean }) {
  return (
    <span className="odometer-cell" aria-hidden>
      <span
        className="odometer-strip"
        style={{
          transform: `translate3d(0, ${-(ready ? digit : 0) * 10}%, 0)`,
          transitionDelay: `${delay}ms`,
        }}
      >
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
}

interface OdometerProps {
  value: Money;
  currency?: CurrencyCode;
  /** Kuruş hanelerini göster */
  showFraction?: boolean;
  className?: string;
  fractionClassName?: string;
  symbolClassName?: string;
  /** Açılışta sıfırdan sayarak gelsin */
  animateOnMount?: boolean;
  /** Başlangıç gecikmesi (ms) — orkestrasyon için */
  startDelay?: number;
}

/**
 * Mekanik sayaç gibi dönen tutar. Her rakam sütunu bağımsız kayar; rakamlar
 * sağdan hizalı anahtarlanır, böylece hane sayısı değişse de sütunlar sabit kalır.
 */
export function Odometer({
  value,
  currency = 'TRY',
  showFraction = true,
  className,
  fractionClassName,
  symbolClassName,
  animateOnMount = true,
  startDelay = 0,
}: OdometerProps) {
  const [ready, setReady] = useState(!animateOnMount);
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setReady(true), startDelay + 30);
    return () => window.clearTimeout(t);
  }, [ready, startDelay]);

  const p = moneyParts(value, currency);
  const chars = p.integer.split('');
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  let digitIndexFromLeft = 0;

  return (
    // role="text" standart değil, rolsüz aria-label okunmaz: tutar gizli metinle, dönen rakamlar gizli
    <span className={cn('odometer', className)}>
      <span className="sr-only">{formatMoney(value, currency)}</span>
      {p.negative && <span aria-hidden>−</span>}
      <span aria-hidden className={cn('odometer-symbol', symbolClassName)}>
        {p.symbol}
      </span>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`sep-${fromRight}`} aria-hidden className="odometer-sep">
              {ch}
            </span>
          );
        }
        const idx = digitIndexFromLeft++;
        return <Roller key={`d-${fromRight}`} digit={Number(ch)} ready={ready} delay={(digitCount - idx) * 45} />;
      })}
      {showFraction && (
        <span aria-hidden className={cn('odometer-fraction', fractionClassName)}>
          {p.decimal}
          {p.fraction.split('').map((ch, i) => (
            <Roller key={`f-${i}`} digit={Number(ch)} ready={ready} delay={i * 30} />
          ))}
        </span>
      )}
    </span>
  );
}
