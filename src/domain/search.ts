/**
 * Seçim listeleri ve komut paleti için Türkçe arama puanı (0 = eşleşme yok, 1 = en iyi).
 * Bulanık "harf harf" eşleşme bilerek yok: "demir" yazan kullanıcı "AkDEniz Meyve İhRacat"ı görmemeli.
 */
import { normalizeTr } from './nlp';

const words = (s: string) => s.split(/[\s.,;:/()\-–]+/).filter(Boolean);

export function searchScore(label: string, query: string, keywords: string[] = []): number {
  const q = normalizeTr(query).trim();
  if (!q) return 1;
  const hay = normalizeTr([label, ...keywords].join(' '));
  const ws = words(hay);
  if (hay.startsWith(q)) return 1;
  if (ws.some((w) => w.startsWith(q))) return 0.95;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => ws.some((w) => w.startsWith(t)))) return 0.8;
  if (hay.includes(q)) return 0.5;
  return 0;
}
