# Mizan — Nakit Akışı ve Finans Yönetimi · Tasarım Spec'i

- **Tarih:** 2026-09-29
- **Durum:** Taslak — kullanıcı incelemesi bekliyor
- **Kapsam:** Ürün, mimari, veri modeli, yapay zekâ, görsel dil, fazlara bölünmüş teslim planı

---

## 1. Anlayış notu (kullanıcının söyledikleri vs. varsayımlar)

**Kullanıcının söyledikleri**
- Gelirleri, giderleri, banka hesaplarını, cari hesapları, yaklaşan ödemeleri ve tahsilatları tek yerden yönetmek.
- Finansal raporlar oluşturmak.
- Nakit akışını anlık takip etmek.
- Tasarım Awwwards seviyesinde; içerik "rakipsiz".
- Gerekirse Groq gibi ücretsiz bir API ile yapay zekâ desteği; önemli yerlerde kapsamlı düşünülmesi.
- Kredi/maliyet önemsiz; en iyi ürün hedefleniyor.

**Varsayımlar** (oturum "don't ask" modunda olduğu için soru sorulamadı; her biri itiraza açık)
1. Kullanıcı Türkiye'de faaliyet gösteren bir KOBİ'nin sahibi veya finans sorumlusu. Uygulama tek şirket için, ama veri modeli çok şirketli kullanıma hazır (`workspaceId` her kayıtta).
2. Arayüz Türkçe. Ana para birimi TRY; USD/EUR/GBP hesapları birinci sınıf.
3. Veri cihazda kalır (local-first). Sunucu, hesap açma, abonelik yok. Yedekleme dosya ile.
4. Yapay zekâ isteğe bağlıdır. Kapalıyken uygulamanın tamamı kural tabanlı yedeklerle çalışır.
5. e-Fatura/e-Arşiv kesme kapsam dışıdır (Paraşüt/BizimHesap'ın alanı); Mizan belge kaydını *nakit akışı ve cari takibi* için tutar.

**Başarı ölçütleri**
- Kullanıcı sabah uygulamayı açtığında 5 saniye içinde şunları görebilmeli: bugünkü toplam nakit, önümüzdeki 30/90 günde nakdin nereye gideceği, hangi gün sıkışacağı, kimin ödemesinin geciktiği.
- Bir tahsilat/ödeme kaydı klavyeden 10 saniyenin altında girilebilmeli (doğal dil ile tek satır).
- Her ekran masaüstü ve mobilde (375 px) kullanılabilir; WCAG 2.2 AA.
- Alan mantığı (bakiye, projeksiyon, yaşlandırma, KDV tahmini) birim testleriyle kanıtlanmış olmalı.

---

## 2. Pazar araştırması ve konumlandırma

| Oyuncu | Güçlü olduğu yer | Mizan'ın fırsatı |
|---|---|---|
| Paraşüt, BizimHesap, Logo İşbaşı, KolayBi | e-Belge, müşavir entegrasyonu, pazaryeri entegrasyonları, banka hareket çekme | Nakit akışı *projeksiyonu*, senaryo planlama, tahsilat zekâsı neredeyse yok — kayıt tutuyorlar, geleceği göstermiyorlar |
| Agicap, Float | 13 haftalık projeksiyon, senaryolar, bütçe vs. gerçekleşen, çoklu şirket | Türkiye'yi bilmiyorlar: çek/senet portföyü, KDV/SGK/muhtasar takvimi, TL–döviz gerçekliği, Türkçe doğal dil |
| Logo İşbaşı sesli asistan | "Ahmet Yılmaz'a 5.000 liralık fatura kes" | Mizan'da sesli/yazılı giriş *nakit akışı ve cari* için; üstüne veriyle konuşan asistan |

**Konumlandırma cümlesi:** *Mizan, Türk KOBİ'sinin nakdini bugünden 13 hafta ileriye kadar gösteren, çek/senet ve vergi takvimini bilen, tahsilatı akıllıca yöneten, verisini cihazdan çıkarmayan finans kokpitidir.*

**Rakipsiz kılan 8 özellik**
1. **Olasılıklı nakit projeksiyonu:** Baz, iyimser ve kötümser bant. Kötümser senaryo, her carinin *geçmiş ödeme gecikmesinden* hesaplanır.
2. **"Ya şöyle olursa?" senaryoları:** Bir tahsilatı ertele, yeni gider ekle, geliri %X düşür. Etkisi grafikte anında görülür.
3. **Çek/senet portföyü:** Vade merdiveni, ciro, karşılıksız takibi. Portföydeki çekler projeksiyonu besler.
4. **Türk vergi takvimi ve KDV tahmini:** Belgelerdeki KDV'den bir sonraki ayın 28'inde ödenecek tahmini KDV otomatik öngörülür. SGK, muhtasar ve geçici vergi için hazır tekrar şablonları vardır.
5. **Tahsilat zekâsı:** Cari bazında ödeme davranışı skoru, gecikme eğilimi, DSO, "önce kimi aramalı" sıralaması ve tek tıkla nazik/resmi/kararlı hatırlatma mesajı taslağı (WhatsApp/e-posta).
6. **Doğal dil ve sesle kayıt:** "Yıldız İnşaat'tan 45 bin tahsilat, vade 15 Ekim" → yapılandırılmış taslak. Sesle girişte Groq Whisper kullanılır.
7. **Veriyle konuşan asistan:** "Kasım'da nakit açığım olur mu?" Model rakam uydurmaz; yerel hesaplama fonksiyonlarını araç olarak çağırır.
8. **Ayın Hikâyesi:** Aylık finansal özet, sinematik scrollytelling ile anlatılır (Spotify Wrapped'ın işletme versiyonu).

---

## 3. Yaklaşımlar ve karar

| | A. Local-first SPA (**seçilen**) | B. Full-stack SaaS | C. A + sonradan senkron |
|---|---|---|---|
| Yığın | Vite + React + IndexedDB (Dexie) | Next.js + Postgres + Auth + sunucu tarafı AI proxy | A'nın depo katmanı arkasına senkron sunucu |
| Artı | Anında çalışır, çevrimdışı, sıfır altyapı/maliyet, veri gizliliği, reaktif canlı sorgular | Çok cihaz/kullanıcı, API anahtarı gizli, satışa hazır | A'nın artıları + gelecekte çok cihaz |
| Eksi | Tek cihaz (yedek dosyasıyla taşınır); BYOK anahtar tarayıcıda | Altyapı, barındırma, bakım; çevrimdışı yok; teslim süresi 2–3 kat | Senkron çatışma çözümü ayrı proje |

**Karar:** A, C'ye hazır sınırlarla. Tüm veri erişimi `repositories` arayüzünden geçer. Kayıtlarda `workspaceId`, `createdAt`, `updatedAt` ve UUID bulunur. Bu, ileride Dexie Cloud veya özel bir senkron sunucusu eklemeyi mümkün kılar.

---

## 4. Mimari

### 4.1 Teknoloji yığını (2026-09 sürümleri)
| Katman | Seçim | Gerekçe |
|---|---|---|
| Derleme | Vite 8, TypeScript 7 | vite-spa profili; hızlı HMR |
| UI | React 19.3 | Ekosistem, eşzamanlı render |
| Stil | Tailwind CSS 4.3 + CSS değişkenli tasarım token'ları | Token tabanlı tema (açık/koyu) |
| Erişilebilir ilkel bileşenler | `radix-ui` (Dialog, Popover, DropdownMenu, Tooltip, Tabs, Select, Switch) | Klavye/ARIA doğru; görünüm tamamen bize ait |
| Yönlendirme | React Router 8 (lazy route) | Rota bazlı kod bölme zorunlu |
| Veri | Dexie 4 + `dexie-react-hooks` (`useLiveQuery`) | IndexedDB; her yazma tüm ekranları anında günceller ("anlık takip") |
| UI durumu | Zustand 5 | Komut paleti, asistan çekmecesi, tercihler |
| Formlar | react-hook-form + zod 4 | Şema doğrulama, Türkçe hata mesajları |
| Grafikler | Özel SVG + d3-scale / d3-shape / d3-array | Tam görsel kontrol, küçük paket |
| Hareket | `motion` (uygulama içi), GSAP + ScrollTrigger (yalnızca Ayın Hikâyesi, lazy) | Epic-design teknikleri tek rotada |
| Tarih | date-fns 4 + `tr` locale | |
| İçe aktarma | papaparse (CSV), SheetJS (XLSX, CDN tarball) | Türk bankaları çoğunlukla Excel ekstre verir |
| İkonlar | @phosphor-icons/react (light/regular) | Lucide'den farklı karakter; tree-shake |
| Bildirim | sonner | Geri al (undo) destekli toast |
| Komut paleti | cmdk | ⌘K |
| Test | Vitest 5 + fake-indexeddb, Playwright 1.63 + axe | Alan mantığı TDD; e2e + erişilebilirlik |
| PWA | vite-plugin-pwa | Kurulabilir, çevrimdışı |

### 4.2 Katmanlar ve bağımlılık yönü
```
src/
  domain/      Saf TypeScript. React/Dexie bilmez. Para, tarih, tekrar, bakiye,
               projeksiyon, yaşlandırma, KDV, raporlar, içgörüler, doğal dil ayrıştırıcı,
               doğrulayıcılar (IBAN/VKN/TCKN). %100 birim testli.
  data/        Dexie şeması, repository'ler, demo veri üretici, yedek al/yükle,
               kur servisi. domain'e bağımlı.
  ai/          Sağlayıcı arayüzü (OpenAI uyumlu), Groq istemcisi, istemler, şemalar,
               asistan araçları, önbellek, hız sınırı yönetimi. domain + data'ya bağımlı.
  ui/          Tasarım sistemi: token'lar, ilkel bileşenler, Money/Amount/Delta,
               EmptyState, Sheet, Field…  Alan bilgisi içermez.
  charts/      Grafik bileşenleri (ForecastChart, TideTimeline, Rosette, Bars, Heatmap…).
  features/    Sayfa ve özellik modülleri (kokpit, akis, islemler, hesaplar, cariler,
               takvim, cekler, raporlar, hikaye, asistan, ayarlar, ice-aktar, karsilama).
  app/         Router, kabuk (AppShell), sağlayıcılar, komut paleti, klavye kısayolları.
```
Kural: `domain` hiçbir katmanı import etmez. `features` diğer `features`'ı import etmez; paylaşılanlar `ui`/`charts`'a taşınır.

### 4.3 Veri akışı
1. Kullanıcı eylemi → `features` içindeki form → zod doğrulama → `data/repositories.*.create()`.
2. Dexie yazma → `useLiveQuery` abonelikleri tetiklenir → hesaplanmış görünümler (`domain` fonksiyonları, `useMemo` ile) yeniden hesaplanır.
3. Projeksiyon gibi ağır hesaplar `useDeferredValue` ile bloklamadan güncellenir. 10.000+ işlemde Web Worker'a taşınır (Faz 6'da ölçülür).

---

## 5. Veri modeli

Para tutarları **tam sayı alt birim** (kuruş/cent) olarak saklanır: `Money = number` (integer). Kayan nokta aritmetiği yoktur. Kur çarpımında `Math.round` (bankacı yuvarlaması: yarımı çifte) kullanılır.

```ts
Workspace   { id, name, legalName?, taxId?, baseCurrency: 'TRY', fiscalYearStartMonth, createdAt, updatedAt }

Account     { id, workspaceId, name, kind: 'bank'|'cash'|'card'|'pos'|'investment'|'other',
              institution?, iban?, currency, openingBalance: Money, openingDate,
              minBalance?: Money, creditLimit?: Money, color, archived, sortOrder, createdAt, updatedAt }

Category    { id, workspaceId, name, kind: 'income'|'expense', parentId?, color, icon,
              monthlyBudget?: Money, archived, system? }

Contact     { id, workspaceId, name, kind: 'customer'|'supplier'|'both'|'other',
              taxId?, taxOffice?, email?, phone?, iban?, address?, paymentTermDays?,
              riskLimit?: Money, currency, openingBalance: Money /* + bize borçlu */, tags[], notes?, archived }

Transaction { id, workspaceId, kind: 'income'|'expense'|'transfer', date, accountId,
              amount: Money /* hesabın para biriminde, pozitif */, currency, rateToBase,
              toAccountId?, toAmount?, categoryId?, contactId?,
              affectsLedger: boolean /* cari hesaba işler mi (tahsilat/ödeme) */,
              description, reference?, tags[],
              source: 'manual'|'import'|'document'|'recurring'|'instrument'|'ai',
              recurringId?, occurrenceDate?, instrumentId?, importHash?, createdAt, updatedAt }

Document    { id, workspaceId, direction: 'receivable'|'payable', contactId?, categoryId?,
              title, number?, issueDate, dueDate, amount: Money /* KDV dahil */, currency, rateToBase,
              vatRate?: 0|1|10|20, vatAmount?: Money, expectedAccountId?, probability?: 0-100,
              cancelled: boolean, notes?, createdAt, updatedAt }
              // Durum türetilir: open | partial | paid | overdue | cancelled

Allocation  { id, workspaceId, documentId, transactionId?, instrumentId?, amount: Money, date }

RecurringRule { id, workspaceId, direction: 'in'|'out', title, amount: Money, currency,
              accountId?, categoryId?, contactId?, frequency: 'weekly'|'monthly'|'quarterly'|'yearly',
              interval, anchorDate, dayOfMonth?, endDate?, weekendPolicy: 'none'|'next'|'previous',
              autoPost: boolean, active, template?: 'kdv'|'muhtasar'|'sgk'|'gecici-vergi'|'kira'|'maas'|'kredi' }

Instrument  { id, workspaceId, kind: 'cheque'|'note', direction: 'received'|'issued', serialNo,
              bank?, branch?, drawer?, contactId, amount: Money, currency, issueDate, dueDate,
              status, history: { status, date, note?, contactId?, accountId? }[], accountId?, createdAt, updatedAt }
              // received: portfolio → deposited → collected | endorsed | bounced | returned
              // issued:   issued → paid | bounced | cancelled

Scenario    { id, workspaceId, name, color, active, adjustments: Adjustment[] }
Adjustment  = { type: 'delay',   target: TargetRef, days }
            | { type: 'exclude', target: TargetRef }
            | { type: 'oneOff',  direction, amount, date, label }
            | { type: 'recurring', direction, amount, frequency, start, end?, label }
            | { type: 'scale',   direction, percent, from?, to? }

Rate        { id: `${date}:${currency}`, date, currency, perBase /* 1 USD = 49,0 TRY */, source: 'ecb'|'manual' }
Rule        { id, workspaceId, pattern, categoryId?, contactId?, hits, source: 'user'|'ai' }  // öğrenen kategorizasyon
Setting     { key, value }  // tema, AI ayarları, eşikler, onboarding
AiCache     { hash, value, createdAt }
```

### 5.1 Muhasebe kuralları (doğruluk sözleşmesi)
- **Hesap bakiyesi** = açılış + Σ gelir − Σ gider − Σ giden transfer + Σ gelen transfer (`toAmount`).
- **Cari bakiye** (+ = bize borçlu) = açılış + Σ alacak belgeleri − Σ borç belgeleri − Σ cari tahsilatlar + Σ cari ödemeler ± cari çekler (alınan çek alacağı kapatır, verilen çek borcu kapatır). İptal edilen belgeler hariçtir.
- **Belge durumu** tahsis (allocation) toplamından türetilir. Tahsilat/ödeme girilirken açık belgelere FIFO ile otomatik tahsis önerilir; kalan tutar "avans" olarak cari hesapta görünür.
- **Nakit ve tahakkuk esası:** Gelir-gider tablosu iki esasta çalışır. Nakit esasında gerçekleşen işlemler sayılır; tahsilat/ödemeler kategorisini tahsis edildiği belgeden alır. Tahakkuk esasında belgeler düzenleme tarihine, doğrudan işlemler ise kendi tarihine göre sayılır.
- **Kur:** Her işlem ve belge oluşturulduğu anki `rateToBase` değerini saklar; raporlar bu değeri kullanır. Güncel pozisyon, döviz hesaplarını en güncel kurla çevirir. Değerleme farkı "kur etkisi" olarak gösterilir.

---

## 6. Nakit akışı motoru (çekirdek fark)

**Girdiler:** Hesap bakiyeleri (baz para birimine çevrilmiş), açık belgelerin kalan tutarları (vade tarihinde), tekrar kurallarının sanal oluşumları, portföydeki/tahsildeki alınan çekler, ödenmemiş verilen çekler, KDV tahmini (açıksa), aktif senaryonun düzeltmeleri. İsteğe bağlı olarak "planlanmamış akış tahmini" de eklenir: son 90 günün belgesiz günlük net ortalaması.

**Çıktı:** Her gün için `{ date, expected, optimistic, pessimistic, inflow, outflow, items[] }` ile uyarılar.
- **İyimser:** Her şey vadesinde.
- **Baz:** Alacaklar carinin ortalama gecikmesi kadar kaydırılır; `probability` ağırlığı uygulanır.
- **Kötümser:** Alacaklar gecikmenin P80'i kadar kaydırılır; olasılığı %50'nin altındaki alacaklar dışarıda kalır; giderler vadesinde.

**Uyarılar:** Minimum bakiye eşiğinin veya sıfırın altına ilk düşüş günü, o düşüşü tetikleyen en büyük 3 kalem ve hesap bazında eşik ihlalleri.

**Ufuklar:** 30, 90 (varsayılan: 13 hafta), 180 ve 365 gün. Görünüm günlük, haftalık veya aylık.

**KDV tahmini:** Ay içi Σ hesaplanan KDV (alacak belgeleri) − Σ indirilecek KDV (borç belgeleri) → pozitifse izleyen ayın 28'inde çıkış. Negatifse bir sonraki aya devreder. Arayüz bunun bir tahmin olduğunu ve beyan süresi uzatmalarının GİB duyurularından doğrulanması gerektiğini açıkça belirtir.

**Vergi şablonları:** Muhtasar ve prim hizmet (ayın 26'sı), KDV (izleyen ayın 28'i), SGK primi, geçici vergi (dönemi izleyen 2. ayın 17'si). Hafta sonuna denk gelen tarihler bir sonraki iş gününe kayar. Tutarlar kullanıcı tarafından girilir.

---

## 7. Yapay zekâ (Groq, BYOK, isteğe bağlı)

### 7.1 İlkeler
1. **Rakamı model değil, kod üretir.** Tüm hesaplar `domain`'de deterministiktir. Model yalnızca dili yapıya çevirir (ayrıştırma, sınıflandırma) ya da yapıyı dile çevirir (anlatım, mesaj taslağı).
2. **Varsayılan kapalı.** Açmak için anahtar ve bilgilendirilmiş onay gerekir. Onay ekranı Groq'a hangi verinin gideceğini açıkça söyler.
3. **Veri minimizasyonu.** Asistan ham işlem listesi değil, araç çağrısı sonuçları (özet JSON) görür. İsteğe bağlı **cari isim maskeleme** vardır: isimler "C1, C2…" takma adlarıyla gönderilir, yanıt yerelde geri çözülür.
4. **Her özelliğin AI'sız yedeği vardır:** kural tabanlı ayrıştırıcı, öğrenen kurallar, şablon cümleler.

### 7.2 Sağlayıcı
- OpenAI uyumlu `POST /openai/v1/chat/completions`. Tarayıcıdan doğrudan çağrı mümkün: CORS `access-control-allow-origin: *` doğrulandı.
- Model listesi `GET /openai/v1/models` ile çalışma anında çekilir. Varsayılanlar: `openai/gpt-oss-120b` (asistan, anlatım) ve `openai/gpt-oss-20b` (ayrıştırma, sınıflandırma). Llama modelleri 16 Ağustos 2026 itibarıyla ücretsiz katmandan çıktığı için varsayılan değildir.
- Strict structured outputs (`response_format.json_schema`, `strict: true`) gpt-oss modellerinde desteklenir; streaming ve tool use ile birlikte kullanılamaz. Bu yüzden ayrıştırma ve sınıflandırma strict şema ile, asistan ise tool calling (şemasız) ile çalışır.
- Ücretsiz katman sınırları (organizasyon başına, modele göre): 30 istek/dk, 1.000 istek/gün, 8K token/dk, 200K token/gün. İstemci tarafı bir token kovası tutulur; 429'da `retry-after` beklenir ve kullanıcıya süre gösterilir; aynı istek hash'i önbellekten döner.
- Ses: `whisper-large-v3-turbo` ile `POST /openai/v1/audio/transcriptions` (MediaRecorder → webm).
- Sağlayıcı arayüzü soyuttur. Groq dışında OpenAI uyumlu herhangi bir uç nokta (OpenRouter, yerel Ollama vb.) ayarlardan tanımlanabilir.

**Sağlayıcı kararı (2026-09-29):**

| Sağlayıcı | Rol | Gerekçe |
|---|---|---|
| Groq | Varsayılan: asistan, doğal dil ile kayıt, kategorizasyon, anlatımlar, Whisper ile ses | Sözleşmeyle eğitimde kullanmaz; varsayılan olarak saklamaz; ZDR seçeneği; CORS; strict JSON |
| Gemini Flash (ücretsiz) | İsteğe bağlı: yalnızca fiş/fatura fotoğrafı okuma | Görüntü desteği ve cömert limit; ancak ücretsiz katman girdileri eğitimde kullanılabilir → açık uyarı ve yalnızca fiş görüntüsü gönderilir |
| Ollama / OpenAI uyumlu uç nokta | İsteğe bağlı: tam yerel | Veri cihazdan çıkmaz |

### 7.3 Özellikler
| Özellik | Nerede | Model rolü | AI'sız yedek |
|---|---|---|---|
| Doğal dil ile kayıt | Komut paleti, "+ Kayıt" | Metin → `{tür, tutar, para birimi, tarih, vade, cari, kategori, hesap, açıklama}` (strict şema; cari/kategori listeleri adaylar olarak verilir) | Türkçe kural ayrıştırıcı ("45 bin", "1,5 milyon", "yarın", "15 Ekim", "ay sonu", "haftaya cuma") |
| Sesle kayıt | Palet mikrofonu | Whisper → yukarıdaki ayrıştırıcı | Tarayıcı Web Speech API (varsa) |
| Akıllı kategorizasyon | Ekstre içe aktarma | 25'lik partilerle açıklama → kategori + cari eşleşmesi + güven skoru; onaylanan eşleşmeler `Rule` olarak öğrenilir | Öğrenen kurallar + anahtar kelime sözlüğü |
| Finans asistanı | Sağ çekmece (⌘J) | Tool calling ile yerel fonksiyonlar: `get_overview`, `get_forecast`, `get_upcoming`, `get_overdue`, `get_category_breakdown`, `get_monthly_summary`, `search_transactions`, `get_contact`, `simulate` | Hazır soru kartları, doğrudan ilgili ekrana götürür |
| Kokpit içgörüleri | Kokpit | Deterministik tespitler (anomali, yoğunlaşma riski, gecikme artışı, düşüş günü, runway) → 3 cümlelik brifing | Şablon cümleler |
| Tahsilat hatırlatma | Gecikmiş alacak satırı, cari detay | Ton (nazik/resmi/kararlı) ve kanal (WhatsApp/e-posta) için Türkçe taslak | Üç hazır şablon |
| Ayın Hikâyesi anlatısı | Hikâye sayfası | Bölüm başlıkları ve yorumlar | Şablon anlatı |
| Rapor yorumu | Rapor sayfaları | 3 maddelik yönetici özeti | Gizlenir |

---

## 8. Ürün yüzeyleri (ekranlar)

1. **Karşılama (ilk açılış):** Sinematik tanıtım; ardından "Demo işletmeyle keşfet" veya "Kendi işletmemi kur" (şirket adı, ilk hesaplar, açılış bakiyeleri, eşik).
2. **Kokpit:** Nakit pozisyonu (hero) ve veriden üretilen gravür rozeti; 90 günlük akış mini grafiği ve düşüş uyarısı; önümüzdeki 14 günün gelgit zaman çizelgesi (giriş yukarı, çıkış aşağı); gecikmiş alacaklar; hesaplar; 12 aylık gelir–gider; içgörüler; çek portföyü özeti.
3. **Nakit Akışı:** Büyük projeksiyon grafiği (bant, eşik, senaryo katmanları), ufuk ve granülarite seçici, senaryo paneli, sürücü kalemler tablosu (dahil/hariç anahtarları), nakit takvimi ısı haritası.
4. **İşlemler:** Hızlı filtreler, arama, toplu seçim, satır içi düzenleme, sanal liste (10K+ satır), CSV/XLSX dışa aktarma.
5. **Hesaplar:** Kart ızgarası değil, "defter sırtları": hesap başına bakiye kıvılcım çizgisi; detayda hareketler ve kur etkisi; hesaplar arası transfer.
6. **Cariler:** Liste (bakiye, gecikme skoru, risk limiti doluluğu); detayda ekstre (running balance), açık belgeler, yaşlandırma, ödeme davranışı ve hatırlat eylemi.
7. **Takvim (Ödemeler & Tahsilatlar):** Ay/hafta/liste görünümü; belgeler, tekrarlar, çekler ve vergi şablonları tek zaman çizelgesinde; "Öde / Tahsil et" → mühür animasyonu → işlem + tahsis.
8. **Çek & Senet:** Portföy tablosu, vade merdiveni grafiği, durum geçişleri (tahsile ver, ciro et, karşılıksız işaretle), ortalama vade.
9. **Raporlar:** Gelir-gider tablosu (nakit/tahakkuk), nakit akış tablosu, cari yaşlandırma, kategori analizi, bütçe vs. gerçekleşen, KDV özeti, döviz pozisyonu. Dışa aktarma: CSV, XLSX, yazdır/PDF (özel print stylesheet).
10. **Ayın Hikâyesi:** Epic-design teknikleri: sabitlenmiş sahneler, kelime kelime aydınlanan anlatı, büyük rakamların sayarak gelişi, clip-path açılışları, gravür katmanlarında derinlik (parallax).
11. **Asistan:** Sağ çekmece; mobilde tam ekran.
12. **İçe Aktar:** Sihirbaz — dosya → kolon eşleme (banka ön ayarları + otomatik algılama; `1.234,56` ve `;` ayırıcı) → mükerrer tespiti (`importHash`) → AI/kural kategorizasyonu → onay.
13. **Ayarlar:** Şirket, hesap/kategori yönetimi, para birimleri ve kurlar, eşikler, AI (anahtar, model, maskeleme, test), yedek al/yükle (JSON), demo verisini sıfırla, tema.

**Global:** ⌘K komut paleti (gezinme, arama, doğal dil kayıt), `N` yeni kayıt, `G+K` kokpit gibi kısayollar, asistan için ⌘J, tüm silmelerde geri al toast'ı, "Veriler bu cihazda" göstergesi.

---

## 9. Görsel dil — "İznik × Gravür"

**Konu kökü:** Para güvenlik baskısının dili (guilloché gravür çizgileri, banknot rakamları) ile Türk çini geleneğinin paleti (İznik kobalt, turkuaz, mercan kırmızısı) buluşuyor. Adın kaynağı "mizan" (terazi; muhasebede mizan tablosu).

### 9.1 Renk token'ları
| Token | Açık (Porselen) | Koyu (Gece Kobaltı) | Görev |
|---|---|---|---|
| `--ground` | `#F3F5F8` | `#0A1024` | Zemin |
| `--surface` | `#FFFFFF` | `#111A33` | Paneller |
| `--ink` | `#0F1A3D` | `#E7ECF7` | Metin |
| `--cobalt` | `#2340B8` | `#8FA3FF` | Marka, etkileşim, "sen" |
| `--inflow` | `#067A6C` | `#43D1BD` | Giriş (turkuaz) |
| `--outflow` | `#C23A2B` | `#FF8A73` | Çıkış (mercan) |
| `--saffron` | `#A86A00` | `#F2B84B` | Bekleyen/uyarı |

Renk görevden gelir: turkuaz yalnızca para girişi, mercan yalnızca çıkış, kobalt yalnızca etkileşim ve marka içindir. Hiçbiri dekorasyon olarak kullanılmaz. Grafik paleti dataviz doğrulayıcısından geçirilir.

### 9.2 Tipografi
- **Bodoni Moda (değişken, opsz 6–96):** Hero tutarlar, sayfa başlıkları, Hikâye. Banknot rakamlarının yüksek kontrastlı Didone karakteri. Kuruş kısmı küçük punto ve hafif ağırlıkla yazılır.
- **IBM Plex Sans (değişken, wght + wdth 85–100):** Tüm arayüz ve tablolar. Tablolarda `tabular-nums` ve `wdth 88` (dar), böylece yoğun sayısal kolonlar hizalı ve kompakt olur.
- Ölçek (Bringhurst): 12 · 13 · 14 (gövde) · 16 · 18 · 21 · 24 · 36 · 48 · 72 · 96.
- Kaçınılanlar: büyük harfli etiketler, başlıkta tek kelime vurgusu, küçük veri etiketleri için monospace.

### 9.3 İmza öğesi — Gravür Rozeti
Kokpit hero'sunda SVG ile prosedürel olarak üretilen bir guilloché rozeti. 12 halka son 12 ayı temsil eder; halka dalga genliği o ayın net akışını, dalga fazı gelir/gider oranını kodlar. Sayfa açılışında çizgiler bir kez çizilir (tek orkestrasyonlu an) ve hero rakamı sayarak gelir. Hover'da ayın değeri görünür; tablo görünümü mevcuttur. Aynı gravür dili boş durumlarda ve Hikâye'de tekrar eder. Başka hiçbir yerde dekoratif çizgi yoktur.

### 9.4 Yerleşim
```
┌────┬───────────────────────────────────────────────────────────────┐
│ ◎  │ Kokpit                               [ Ara veya yaz…  ⌘K ] [+] │
│    ├───────────────────────────────────────────────────────────────┤
│ ▦  │ Nakit pozisyonu                                  ╭──────────╮  │
│ ≋  │ ₺4.812.340,55                                    │  rozet   │  │
│ ⇅  │ son 30 gün +%6,2   TRY 3,9M · USD 14,2K · EUR 3K  ╰──────────╯  │
│ ▭  ├───────────────────────────────────────────────┬───────────────┤
│ ☷  │ 90 günlük akış (bant, eşik, düşüş işareti)     │ Dikkat        │
│ ▤  │                                               │ İçgörüler     │
│ ▥  ├───────────────────────────────────────────────┴───────────────┤
│    │ Önümüzdeki 14 gün  ↑ girişler ────────── ↓ çıkışlar            │
│ ✦  ├──────────────────────┬──────────────────────┬─────────────────┤
│ ⚙  │ Gecikmiş alacaklar    │ Hesaplar             │ 12 ay gelir–gider│
└────┴──────────────────────┴──────────────────────┴─────────────────┘
```
- Sol dikey ray navigasyonu (daraltılabilir); mobilde alt sekme çubuğu ve "Daha fazla" menüsü.
- İçerik sola hizalı; tablolarda tutarlar sağa hizalı.
- Hiyerarşiye göre farklı köşe yarıçapları: 22 px ana yüzey, 12 px kontrol, pill yalnızca durum rozetleri. Gölge yerine ton katmanları ve 1 px çizgiler; tek tip kart ızgarası yok.

### 9.5 Hareket dili (kullanıcı notu: "basit dashboard gibi olmasın, her şey animasyonlu ve premium")
- **Açılış orkestrasyonu (Kokpit):** Rozet çizgileri halka halka çizilir; hero tutar mekanik sayaç gibi rakam rakam döner; paneller üstten clip-path perdesiyle, kademeli olarak açılır; grafikler çizilerek gelir, çubuklar tabandan yay fiziğiyle yükselir.
- **Rota geçişleri:** View Transitions API. Paylaşılan öğeler morf eder: hesap kartı hesap başlığına, cari satırı cari detayına dönüşür.
- **Canlı rakamlar:** Tüm tutarlar değiştiğinde odometre gibi yuvarlanır ("anlık takip" hissi).
- **Mikro etkileşimler:** İmleci izleyen ışıklı panel kenarları, manyetik birincil butonlar, ray navigasyonunda yaylı kayan aktif gösterge, satır hover'ında eylemlerin kayarak gelmesi, yaylı çekmece ve palet.
- **Veri hareketi:** Senaryo değişince projeksiyon eğrisi morf eder; düşüş noktası nabız halkasıyla atar; crosshair manyetik olarak veri noktasına yapışır.
- **Anlam anları:** Tahsil/öde → mühür basılır (ölçek + dönüş + mürekkep yayılması). Başarı ve geri al toast'ları yaylı gelir.
- **Doku:** Zeminde çok ince kâğıt greni. İskelet yüklemeler gri blok değil, gravür çizgisi parıltısıdır.
- **Performans:** Yalnızca transform, opacity, clip-path ve filter animasyonu yapılır. `prefers-reduced-motion` açıkken sayma ve çizimler anında son duruma geçer; dokunmatik cihazlarda imleç efektleri kapanır.

---

## 10. Hata yönetimi

| Durum | Davranış |
|---|---|
| IndexedDB kotası / sürüm yükseltme engeli | Toast + "Diğer sekmeleri kapatın" / "Yedek alıp temizleyin" yönlendirmesi |
| Kur servisi erişilemez | Son bilinen kur kullanılır, "Kurlar 3 gün önce" rozeti, elle giriş |
| AI 401 | "Anahtar geçersiz" → Ayarlar'a bağlantı |
| AI 429 | `retry-after` kadar bekleme, geri sayım, yedek yola geçiş |
| AI şema ihlali / ağ hatası | Kural tabanlı sonuca düşülür, kullanıcı taslağı yine onaylar |
| İçe aktarma satır hatası | Satır bazında hata listesi; geçerli satırlar aktarılabilir |
| Silme | Yumuşak silme + 8 sn geri al; bağlı kayıtlar (tahsis) uyarısı |
| Yedek yükleme | Şema sürümü kontrolü ve mevcut veriyi değiştirmeden önce onay |

---

## 11. Test stratejisi
- **Birim (Vitest, TDD):** `domain/*` tamamı (para, ayrıştırma, tekrar, bakiye, cari, tahsis, yaşlandırma, projeksiyon, senaryo, KDV, raporlar, içgörüler, doğrulayıcılar). Hedef: domain satır kapsamı ≥ %90.
- **Depo (Vitest + fake-indexeddb):** CRUD, canlı sorgular, yedek al/yükle tur testi, demo verisinin tutarlılığı.
- **AI:** Sağlayıcı taklit edilir; istem oluşturma, şema çözümleme, yedeğe düşme ve 429 yeniden deneme test edilir.
- **E2E (Playwright):** Karşılama → demo → Kokpit; işlem ekle → bakiye güncellenir; belge oluştur → tahsil et → cari bakiye; senaryo → grafik değişir. Ekran görüntüleri görsel inceleme için alınır.
- **Erişilebilirlik:** Ana sayfalarda axe taraması sıfır ciddi ihlalle geçer; klavye ile tam kullanım.
- **Performans:** İlk yük ≤ 200 KB gzip, rota başına ≤ 80 KB; 10K işlemde Kokpit hesap süresi < 50 ms.

---

## 12. Teslim fazları
Her faz kendi başına çalışan, test edilmiş bir uygulama bırakır.

| Faz | İçerik | Çıktı |
|---|---|---|
| **1 · Temel** | İskelet, token'lar ve UI ilkel bileşenleri, domain çekirdeği (para, tarih, bakiye, cari, tahsis), Dexie şeması ve depolar, demo veri, AppShell + ray navigasyonu + ⌘K, Hesaplar, İşlemler, Kategoriler, Cariler + belgeler, Kokpit v1 | Kayıt tutan, canlı güncellenen uygulama |
| **2 · Nakit akışı** | Tekrar kuralları, projeksiyon motoru (3 bant), uyarılar, senaryolar, Nakit Akışı sayfası, Takvim + öde/tahsil et akışı, Kokpit gelgit çizelgesi ve rozet | Geleceği gösteren uygulama |
| **3 · Türkiye katmanı** | Çek/senet portföyü, KDV tahmini, vergi şablonları, kur servisi ve döviz pozisyonu, IBAN/VKN/TCKN doğrulama | Türk KOBİ'sine özgü derinlik |
| **4 · Raporlar** | Gelir-gider (nakit/tahakkuk), nakit akış tablosu, yaşlandırma, kategori, bütçe, KDV özeti, dışa aktarma, Ayın Hikâyesi | Raporlama ve anlatı |
| **5 · Yapay zekâ** | Groq sağlayıcı, ayarlar ve onay, doğal dil ve sesle kayıt, içe aktarma sihirbazı ile kategorizasyon, asistan (tool calling), içgörü anlatımı, hatırlatma taslakları, maskeleme | AI destekli uygulama |
| **6 · Cila** | Karşılama sinematiği, yedek/geri yükleme, PWA, erişilebilirlik denetimi, performans (worker), e2e paketi, görsel inceleme turları | Yayına hazır |

---

## 13. Kapsam dışı (şimdilik)
e-Fatura/e-Arşiv kesme; canlı banka API entegrasyonu (açık bankacılık lisansı gerektirir; ekstre içe aktarma ile karşılanır); çok kullanıcılı yetkilendirme ve bulut senkronu (mimari buna hazır); stok ve bordro hesaplama; fiş/fatura görüntüsünden okuma (ücretsiz Groq katmanında görüntü modeli yok; model listesi bir görüntü modeli döndürürse eklenir).
