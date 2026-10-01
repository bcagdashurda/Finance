import { describe, expect, it } from 'vitest';
import { minorToCell, toCSV } from './export';

describe('toCSV', () => {
  const cols = [
    { header: 'Açıklama', value: (r: { d: string; n: number }) => r.d },
    { header: 'Tutar', value: (r: { d: string; n: number }) => minorToCell(r.n) },
  ];

  it('neutralises spreadsheet formulas coming from imported bank descriptions (CSV injection)', () => {
    const csv = toCSV(
      [
        { d: '=HYPERLINK("http://kotu.example","Tıkla")', n: 100 },
        { d: '+90 555 000 00 00', n: 100 },
        { d: '@SUM(A1:A2)', n: 100 },
        { d: '-2+3', n: 100 },
      ],
      cols,
    );
    const cells = csv.split('\n').slice(1).map((l) => l.split(';')[0] ?? '');
    expect(cells).toHaveLength(4);
    for (const c of cells) expect(c.replace(/^"/, '')).toMatch(/^'/);
  });

  it('keeps negative amounts as numbers', () => {
    const csv = toCSV([{ d: 'Kira', n: -9_500_000 }], cols);
    expect(csv.split('\n')[1]).toBe('Kira;-95000,00');
  });
});
