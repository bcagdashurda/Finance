# Mizan — Uygulama Planı (yalın kontrol listesi)

Spec: `docs/superpowers/specs/2026-09-29-mizan-finans-design.md`. Her faz sonunda: `npm run test`, `npm run typecheck`, `npm run build`, Playwright ile ekran görüntüsü ve görsel inceleme.

## Faz 1 · Temel
- [ ] İskelet: Vite 8 + React 19 + TS + Tailwind 4, alias `@/`, Vitest, ESLint yok (tsc yeterli)
- [ ] Tasarım token'ları (açık/koyu), fontlar, temel CSS, `prefers-reduced-motion`
- [ ] domain/money: alt birim, biçimleme (tr-TR), Türkçe tutar ayrıştırma, kur çevirimi (TDD)
- [ ] domain/dates: iş günü, ay sonu, Türkçe doğal tarih ayrıştırma (TDD)
- [ ] domain/types + balances + ledger (cari) + allocations + document status + aging (TDD)
- [ ] data/db: Dexie şeması, repository'ler, ayarlar, seed kategorileri
- [ ] data/demo: deterministik 14 aylık demo işletme (Deniz Ambalaj)
- [ ] ui: Button, IconButton, Field/Input/Select/Textarea, Dialog, Sheet, Tabs, Tooltip, Badge, Money, Delta, EmptyState, Segmented, Switch, Kbd
- [ ] app: Router (lazy), AppShell (ray + mobil sekme), ⌘K paleti, tema, kısayollar, toast
- [ ] features: Hesaplar, İşlemler (+form), Cariler (+detay/ekstre), Belgeler (alacak/borç), Kategoriler (ayarlar içinde)
- [ ] Kokpit v1 (pozisyon, hesaplar, 12 ay gelir–gider, gecikmiş alacaklar)

## Faz 2 · Nakit akışı
- [ ] domain/recurrence + forecast (3 bant) + scenarios + alerts + payment behavior (TDD)
- [ ] charts: ForecastChart, TideTimeline, Rosette (guilloché), Heatmap
- [ ] Nakit Akışı sayfası, Takvim sayfası, öde/tahsil et akışı + mühür animasyonu
- [ ] Kokpit v2: rozet hero, 90 gün mini, 14 gün gelgit, uyarılar, içgörüler

## Faz 3 · Türkiye katmanı
- [ ] Çek/senet domain + sayfa + vade merdiveni
- [ ] KDV tahmini, vergi şablonları
- [ ] Kur servisi (Frankfurter v2) + döviz pozisyonu + elle kur
- [ ] IBAN/VKN/TCKN doğrulayıcıları

## Faz 4 · Raporlar
- [ ] domain/reports: gelir-gider (nakit/tahakkuk), nakit akış tablosu, yaşlandırma, kategori, bütçe, KDV
- [ ] Raporlar sayfası + CSV/XLSX + print
- [ ] Ayın Hikâyesi (GSAP ScrollTrigger)

## Faz 5 · Yapay zekâ
- [ ] ai/provider (OpenAI uyumlu, Groq), hız sınırı kovası, önbellek, maskeleme
- [ ] Ayarlar: anahtar, model listesi, test, onay
- [ ] Doğal dil + ses ile kayıt (palet)
- [ ] İçe aktarma sihirbazı (CSV/XLSX) + kategorizasyon + öğrenen kurallar
- [ ] Asistan çekmecesi (tool calling)
- [ ] İçgörü anlatımı, hatırlatma taslakları, rapor yorumu, hikâye anlatısı

## Faz 6 · Cila
- [ ] Karşılama sinematiği + kurulum sihirbazı
- [ ] Yedek al/yükle, PWA
- [ ] axe + klavye denetimi, performans ölçümü, e2e paketi, görsel inceleme turları
