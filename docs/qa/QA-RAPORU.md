# Mizan — Senaryo test raporu

Senaryolar: `senaryolar.md`. Her senaryo Playwright ile gerçek Chrome'da, gerçek kullanıcı gibi tıklanarak oynandı.
Ekran görüntüleri: `ekran/` klasörü (dosya adları senaryo numarasıyla başlar).
Durum: ✅ sorunsuz · 🔧 sorun bulundu, düzeltildi ve yeniden oynandı · ⚠️ açık kaldı · ⏸ dış bağımlılık bekliyor

---

## S1 · İlk izlenim (1366×768) — 🔧

| Soru | İlk durum | Düzeltme sonrası |
|---|---|---|
| Ne kadar param var? | İlk ekranda, büyük ve net ✅ | — |
| Sıkışacak mıyım? | Yalnızca "30 gün sonra" tutarı vardı; en düşük nokta ve eşik ekranın altındaydı ⚠️ | İlk gösterge artık "90 günde en düşük: ₺4.117.143 · 26 Eki'de eşiğin altına iniyor" (kırmızı) |
| Kim bana borçlu? | "1,3 milyon gecikmede" vardı ama kartlar tıklanmıyordu | Üç gösterge kartı da ilgili sayfaya gidiyor (Nakit akışı / Cariler / Takvim) |

Bulunan ve düzeltilen diğer sorunlar:
- **Konsol hatası:** 90 günlük grafikte fare gezinirken `<line> x1: undefined` / `<circle> cx: undefined` (4 hata). Nedeni: hover çizgisinin ilk karesinde başlangıç koordinatı yoktu. Düzeltildi.
- **Yerleşim:** 90 günlük grafik panelinin altında ~300 px boşluk vardı (yandaki 5 tespit kartı paneli uzatıyordu). Tespitler artık ilk 3 + "2 tespit daha"; grafik paneli dolduruyor.
- **Tipografi:** "−₺1,5 milyon · -%22,3" satırında iki farklı eksi işareti. Yüzdeler de artık tipografik eksi (−) kullanıyor.
- Hızlı kaydırmada bir kez boş ekran görüntüsü alındı; üç denemede yeniden üretilemedi. Kaydırma ortasında alınmış bir kare olarak değerlendirildi (kalıcı bir sorun gözlenmedi).

Ölçüm (geliştirme sunucusu): karşılama 65 ms'de, demo verisi 2,4 sn'de hazır. Üretim derlemesinde ayrıca ölçülecek.

Ekran: `s1-2-kokpit-ilk-ekran.jpg` (önce), `s1-5-kokpit-duzeltme.jpg`, `s1-7-grafik-dolgu.jpg` (sonra)

## S2 · Kendi işletmesini kurma ve 4 hesap — 🔧

Akış: Demo bandındaki "Kendi işletmemi kur" → onay → kurulum penceresi kendiliğinden açıldı → İş Bankası TL (IBAN yapıştırıldı, banka kendiliğinden "İş Bankası" doldu), Garanti USD, Merkez kasa, kredi kartı (−86.400, 150 bin limit).

Doğrulama: toplam 1.250.000 + 18.500 × 49 + 42.000 − 86.400 = **₺2.112.100** — ekranda aynı. Kart limit kullanımı %58 (86.400 / 150.000) doğru.

Bulunan ve düzeltilen:
- **Kur hatası (önemli):** Demo, kendi uydurma kurlarını bugünün tarihiyle yazıp gerçek ECB kurunun üzerine yazıyordu; kur güncellemesi de "bugünün kuru var" deyip çalışmıyordu. Demodan çıkınca bu kurlar gerçek işletmede kalıyordu (USD 49 yerine 48,996). Artık demo gerçek kuru ezmiyor, çıkışta uydurma kurlar siliniyor, yeni işletme için kur yeniden çekiliyor. Birim testiyle korunuyor.
- Bu düzeltmeyi yazarken benim soktuğum bir hata (kur tablosu veritabanı işleminin kapsamında değildi → "Kendi işletmemi kur" hata verecekti) yeni test tarafından yakalandı ve düzeltildi.
- Kasa ve "Diğer" türünde para birimi seçilemiyordu (döviz kasası mümkün değildi). Düzeltildi.
- Ad önerisi her türde "Garanti BBVA Ticari"ydi; artık türe göre ("Merkez kasa", "Şirket kredi kartı"…).
- "Banka / kurum" alanı tarayıcının stilsiz datalist'iydi (siyah üçgen); uygulamanın aranabilir seçicisiyle değiştirildi.
- Gözlem, hata değil: Tür kutusunun vurgusu ekran görüntüsünde bir an eski kutuda görünüyor; 150 ms renk geçişinin arka plandaki test penceresinde kare çizilmeden ilerlememesi. 1,8 sn sonraki ölçümde doğru.

## S3 · Carileri tanımlama — 🔧 (yeni özellik)

**Eksik tespit edildi:** Carileri toplu aktarma yoktu; 100+ müşterisi olan bir işletme hepsini elle girmek zorundaydı.
**Eklendi:** "Excel'den aktar" (Logo, Mikro, Luca, Paraşüt çıktıları ya da kendi tablonuz):
- Rapor başlıklarını atlayıp gerçek başlık satırını bulur. İlk denemede "Cari Hesap Listesi" satırını başlık sandığı görüldü; düzeltildi ve teste bağlandı.
- "245.800,00 B / 138.400,00 A" muhasebe bakiyelerini doğru yönle okur (B = bize borçlu, A = biz borçluyuz); ayrı Borç/Alacak kolonlarını da destekler.
- Aynı firma hem 120 (alıcı) hem 320 (satıcı) hesabındaysa tek "müşteri + tedarikçi" cari olarak net bakiyeyle birleştirir.
- Geçersiz VKN/e-posta/IBAN'ı sessizce almaz, satırda gösterir; zaten kayıtlı ya da dosyada tekrar eden carileri atlar.
- Örnek şablon indirilebilir; devir bakiyeleri bugünün tarihiyle kaydedilir (eski hareketler sonradan aktarılsa da iki kez sayılmaz).

Test dosyası (9 cari, üstte 3 başlık satırı): 8 cari eklendi, alacak devri ₺844.101, borç devri ₺200.050, net ₺644.051 — dosyadaki toplamlarla birebir.
Arama ("kuzey" → 1 sonuç), Tedarikçi filtresi (iki rollü firma dahil 4), ada göre Türkçe sıralama (Ö, O'dan sonra) doğru.

Ayrıca: cari formu sadeleştirildi (vergi/IBAN/adres "ek bilgiler"e katlandı), "Kaydet ve yenisini ekle" ile seri giriş, devir bakiyesine tarih eklendi.

**Bulunan muhasebe hatası (önemli):** Devir bakiyesinin tarihi olmadığından, sonradan içe aktarılan eski ekstredeki tahsilatlar cari bakiyesinden **ikinci kez** düşülüyordu (Yıldız Gıda'da ₺360.000 olması gereken bakiye ₺255.000 görünüyordu). Düzeltildi; uçtan uca testte hatayı bilerek geri getirince test kırmızıya düştü (kanıt).

## S4 · Günlük kayıtlar — 🔧

Oynanan: "Kayıt" ile tahsilat (45 bin, Yıldız Gıda), ödeme (38.500, Demir Kumaş), kredi kartıyla yakıt gideri, İş Bankası → kasa transferi; komut paletine yazarak "Yıldız'dan 30 bin tahsilat" ve "yarın 12 bin kira ödemesi"; toast'tan "Geri al"; yanlış kaydı düzenleme.

Doğrulanan rakamlar: Yıldız 245.800 − 45.000 = ₺200.800 · Demir −138.400 + 38.500 = −₺99.900 · Akdeniz ₺86.000 (düzeltme sonrası) — ekranla aynı.

Bulunan ve düzeltilen:
- **Yanlış cariye kayıt (kritik):** Cari seçicide "demir" yazıp Enter'a basınca ödeme **Akdeniz Meyve İhracat**'a işlendi. Neden: harf harf (bulanık) arama "AkDEniz Meyve İhRacat"ı eşleşme saydı ve arama değerine carinin kimlik kodu da karışıyordu. Türkçe duyarlı, kelime başı öncelikli arama yazıldı (birim testli); komut paletinde de aynısı kullanılıyor. Uçtan uca testle korunuyor.
- **Yanıltıcı mesaj:** Devir alacağı olan cariden tahsilatta "açık alacağı yok, avans olarak işlenir" deniyordu. Artık "tutar ₺245.800 cari bakiyesinden (devir) düşülür; fazlası avans" diyor.
- **Yazarak kayıt:** "yarın 12 bin kira ödemesi" cari gerektiren "Ödeme" türüne düşüp kaydedilemiyordu. Cari adı yoksa artık gider/gelir (Kira kategorisi, tarih yarın).
- **İleri tarihli kayıtlar kayboluyordu (önemli):** Yarın tarihli gider ne bugünkü bakiyede ne projeksiyonda ne de İşlemler listesinde görünüyordu. Artık projeksiyonda vadesinde (14 günlük şeritte "1 Eki −₺12 bin"), listede "Planlı" rozetiyle; gerçekleşmiş toplamlara katılmıyor; Takvim'den "ödendi" denince tarihi bugüne çekiliyor.
- Komut paletinde öneri varken "Eşleşen bir şey yok" yazısı da görünüyordu; kaldırıldı.
- Escape ile katman katman kapanma (önce açılır liste, sonra pencere) şüphesi uçtan uca testle doğrulandı; masaüstü ve mobilde doğru çalışıyor.

Ölçüm (geliştirme sunucusu): kayıt penceresi 1,3 sn'de hazır; üretimde ayrıca ölçülecek.

## S5 · Fatura, vade ve döviz — 🔧

Oynanan: Kuzey Mobilya'ya 240 bin TL (%20 KDV, 30 gün vade) satış faturası; Ege Kağıt'tan 5.000 USD alış faturası.
Doğrulanan: USD fatura projeksiyonda 5.000 × 49 = −₺245.000 ile 30 Ekim'de; satış 30 Ekim'de +₺240.000. KDV özeti: hesaplanan ₺40.000, indirilecek ₺40.833 (USD faturanın KDV'si), sonraki aya devir ₺833 — elle hesapla aynı. Bu yüzden projeksiyonda KDV ödemesi olmaması doğru (ilk yorumumda bunu yanlışlıkla hata sanmıştım; veritabanından doğrulandı). Son gün hesabı bayram tatillerini de atlıyor (Nisan dönemi 28 Mayıs Kurban Bayramı → 1 Haziran).

Düzeltilen:
- Varsayılan fatura başlığı belge numarasını iki kez gösteriyordu ("Satış faturası ATL… · ATL…").
- KDV özeti yeni işletmede 11 ay boş satır gösteriyordu; artık ilk KDV hareketinden başlıyor, hiç yoksa açıklama gösteriyor.

## S6 · Çek ve senet — 🔧

Oynanan: Yıldız'dan 60 bin çek (portföy), Kuzey'den 100 bin çek (faturaya dağıtıldı), Özkan'a 18.900 verilen çek; Yıldız çeki Demir'e ciro; Kuzey çeki tahsile verildi → karşılıksız çıktı.
Doğrulanan bakiyeler (önceden elle hesaplandı): Yıldız ₺140.800 · Demir −₺39.900 · Kuzey ₺752.301 (karşılıksız çek bakiyeye geri eklendi) · Özkan ₺0 · Ege −₺287.750. Portföy ortalama vadesi 53 gün (tutar ağırlıklı) doğru.

Bulunan ve düzeltilen:
- **Mobilde çek işlemleri yapılamıyordu (kritik):** Tahsile ver / ciro / karşılıksız menüsü, vade ve durum 640 px altında gizliydi. Artık görünür; 375 px'te taşma yok.
- Eksik alan uyarısı yalnızca toast'tı; artık alan altında, ilk hatalı alana odakla.
- Verilen çekin düşeceği hesap banka adından tahmin ediliyordu; artık "Ödeneceği hesap" seçiliyor.
- Döviz (USD/EUR/GBP) çek/senet girilebiliyor; toplamlar ve ortalama vade TL karşılığıyla.
- Banka alanı stilsiz datalist'ti → aranabilir seçici. Bildirimde ham tarih ("2026-11-29") → "29 Kasım 2026".
- Ciro penceresi devir borcu olan tedarikçi için "avans olarak işlenir" diyordu → "cari bakiyesinden (devir) düşülür".
- Uzak tarihler "vade 29.11.2026 · 29 Kasım 2026" diye tekrar ediyordu → "2 ay sonra".
- Küçük düğmeler dokunmatikte 32 px'ti; görünüm değişmeden dokunma alanı 44 px'e genişletildi.

## S7 · Düzenli ödemeler — 🔧

Oynanan: Kira (95 bin, 5'i), maaş (180 bin, ay sonu), SGK/muhtasar (42 bin, 26'sı) şablonlardan; bugünkü maaş Takvim'den "Öde" ile işaretlendi.
Doğrulanan: Kira 5 Ekim, SGK 26 Ekim, maaş 30 Eylül (bugün); ödeme sonrası toplam nakit ₺2.115.150 → ₺1.935.150 (tam 180 bin).

Bulunan ve düzeltilen:
- **Sahte "Bekleyenler":** Bugün eklenen bir kuralın geçmiş ayları "işaretlenmedi" diye listelenecekti (5 Eylül kirası gibi). Artık kuralın eklendiği günden öncesi sayılmıyor (birim testli).
- **Maaş ay sonu kayması:** Şablon çapası 30 Eylül olduğundan Ekim maaşı 31 yerine 30'a düşecekti. Çapa 31 çeken aya alındı; Ekim'de 31 cumartesi olduğu için doğru biçimde 30 Ekim cuma.
- Ödenen oluşum hâlâ "sonraki 30 Eylül" görünüyordu → "sonraki 30 Ekim".
- Doğrulama toast'tan alan altına; şablon açıklamaları 10,5 px'ten okunur boyuta.

## S8 · Nakit sıkışması analizi (demo) — 🔧

Doğrulanan: 13 haftalık projeksiyon, en düşük nokta, eşik uyarısı ve tetikleyiciler; eşik 3 milyona düşürülünce baz uyarı kalkıp kötümser senaryo uyarısına dönüşüyor (doğru).

Bulunan ve düzeltilen:
- **"Çözüm senaryosu kur" boş açılıyordu.** Artık sıkışmayı tetikleyen en büyük ertelenebilir ödemeyi 14 gün kaydıran hazır bir taslak açıyor.
- **Etkisi görünmüyordu:** Taslak "en düşük nokta değişmez" diyordu (genel dip 2 Aralık'ta, sıkışma 26 Ekim'de). Senaryo ekranına ve kartlarına "eşiğin altında kalınan gün" ölçütü eklendi: "15 gün (bazda 20) · 5 gün azalır".
- Senaryo kartı "En düşük nokta −₺96,2 bin" diyordu (eksi bakiye sanılıyordu) → "En düşük nokta ₺96,2 bin düşer · ₺4,1 milyon, 27 Eki".

## S9 · Gecikmiş alacak takibi (demo) — 🔧

Oynanan: Kokpit → gecikmiş alacak → cari detayı → hatırlatma metni → 200 bin kısmi tahsilat.
Doğrulanan: Tahsilat en eski vadesi geçmiş faturaya dağıtıldı (kalan ₺287.200); "Bize borcu" ₺1.638.013 → ₺1.438.013; hatırlatma metni fatura no, vade, tutar ve IBAN ile hazır; WhatsApp/e-posta ile gönderilebiliyor.

Düzeltilen: Ekstrede ileri tarihli satır (teyit bekleyen sipariş) bakiye sütununu şişiriyordu ve başlıktaki "Bize borcu" ile çelişiyordu → "Planlı" rozetiyle soluk gösteriliyor.

## S10 · Raporlar ve PDF — 🔧 (kullanıcının bildirdiği hata)

**Önce (gerçek Chrome PDF'i):** 12 aylık gelir-gider tablosunun yalnızca Ekim–Nisan sütunları basılıyor, kalan aylar ve Toplam kağıttan taşıp kayboluyordu; sonda boş sayfa; ekrandaki düğmeler kağıtta; gri zemin ve doku efekti yüzünden rapor 3,7 MB; "Ayın hikâyesi" 12 sayfa / 19 MB, sayaçlar ₺0, dev boşluklar.

**Sonra:**

| Çıktı | Önce | Sonra |
|---|---|---|
| Gelir-gider tablosu | yarım sütunlar, 3,7 MB | yatay A4, 12 ay + Toplam, 2 sayfa, 233 KB |
| Nakit akış tablosu | yarım, 3 sayfa | 2 sayfa, 240 KB |
| Kategori analizi | 1. sayfa yalnızca başlık | 1 sayfa |
| Yaşlandırma / KDV | — | 1'er sayfa |
| Ayın hikâyesi | 12 sayfa, 19 MB, ₺0 | 1 sayfalık statik "aylık özet", 161 KB |

Eklenen: belge başlığı (işletme, rapor adı, esas, dönem, hazırlanma tarihi), "Sayfa X / Y" altbilgisi, koyu temada bile açık renk baskı, tablo başlığının her sayfada tekrarı, satırların bölünmemesi.
Kalıcı test: `e2e/yazdirma.spec.ts` gerçek PDF üretip sayfa sayısı, boyut, taşma ve sayfa yönünü denetler. Yatay sayfa kuralı bilerek kapatıldığında test kırmızıya düştü (kanıt). İlk yazdığım sürüm bu hatayı yakalayamıyordu; mutasyon denemesiyle fark edilip güçlendirildi.
