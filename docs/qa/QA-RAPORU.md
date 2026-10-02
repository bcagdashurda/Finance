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

## S11 · Aynı ekstreyi ikinci kez yükleme — 🔧

Oynanan: Eylül ekstresi (13 satır) ikinci kez içe aktarıldı.
Doğrulanan: 13 satırın tamamı "zaten kayıtlı" olarak atlandı, bakiye ve işlem sayısı değişmedi (mükerrer kayıt yok).
Düzeltilen: Tüm satırlar mükerrerken ekran "0 kayıt aktarılacak" diye sessizce bekliyordu; artık "Bu ekstredeki hareketlerin hepsi zaten kayıtlı; aktarılacak yeni hareket yok." açıklaması çıkıyor.

## S12 · Ayarlar, güvenlik, yedek ve koyu tema — 🔧

Oynanan: kategori bütçesi, PIN kilidi (kur → şimdi kilitle → yanlış PIN → doğru PIN), yedek indir → cari sil/arşivle → yedekten geri yükle, yanlış dosya, koyu tema.

Bulunan ve düzeltilen:
- Kategori satırlarında yalnızca küçük kalem simgesi tıklanıyordu; satırın tamamı tıklanabilir, bütçe yoksa "bütçe ekle" ipucu var.
- **PIN kurunca kullanıcı anında kilitleniyordu** (oturum bayrağı kilitten sonra yazılıyordu). Sıra düzeltildi.
- **"Şimdi kilitle" hiç kilitlemiyordu:** kilit durumu iki ayrı yerde tutuluyor ve ayrışıyordu. Tek kaynağa indirildi.
- **Yanlış PIN'e tepki yoktu:** 4 haneli PIN'de yanlış girişten sonra 6 haneye kadar hata gösterilmiyor, ardından doğru PIN de açmıyordu. PIN'in hane sayısı artık kilitle birlikte saklanıyor (telefonlardaki gibi o kadar nokta), o haneye gelince anında "PIN hatalı" + sallanma; hızlı yazımda rakam kaybolmuyor. Eski kilitlerde önceki davranış korunuyor. "PIN'imi unuttum" açıklaması eklendi.
- **Yedekten geri yükleme onaysızdı:** yanlış dosya seçmek mevcut veriyi anında siliyordu. Artık önce işletme adı, yedek tarihi ve içerik (19 işlem · 8 cari · 2 fatura · 4 hesap) gösterilip onay isteniyor. Mizan yedeği olmayan dosya pencere açılmadan reddediliyor.
- **Geri yükleme cihaz ayarlarını eziyordu:** "son yedek" tarihi ve bulut bağlantısı yedekteki eski değerlerle değişiyordu; demodayken gerçek işletme yedeği yüklenince "demo" bayrağı kalıyordu. Düzeltildi (birim testli, önce kırmızı görüldü).
- **Cari silinemiyordu (eksik özellik):** yanlışlıkla eklenen cariyi kaldırmanın yolu yoktu. Cari sayfasına "Arşivle ya da sil" eklendi: kaydı yoksa onayla silinir, varsa arşivlenir (geçmiş ve raporlar korunur); Carilerde "Arşivi göster", arşivden çıkarma.
- Silme ölçütü düzenli ödemeleri ve ciro edilen çekleri saymıyordu → bağlı kayıt kalan cari/hesap silinip kırık bağlantı bırakabilirdi. Artık arşivleniyor (birim testli). Hesap silme de onaysızdı; onay eklendi.
- Nakit akışı grafiğinde en düşük nokta son güne denk gelince "En düşük · 29 Ara" etiketi grafiğin sağından taşıp kesiliyordu; kenarda içeri alınıyor.

Doğrulanan (canlı): yedek → Toros Deterjan silindi (8 → 7), Kuzey Mobilya arşivlendi (7 → 6, "Arşivi göster" ile 7) → geri yükleme sonrası 8 cari, arşiv yok, "Son yedek bugün" korunuyor. Koyu temada Kokpit, Nakit akışı, Takvim, Cariler, Raporlar, Çekler okunaklı.

Ekran: `s12-yedek-onay.png`, `s12-cari-sil-onay.png`, `s12-koyu-*.png`, `s12-akis-endusuk-etiket.png`

## S13 · Telefonda kullanım (375 px; masaüstü kaydırma çubuğuyla fiilen 360 px) — 🔧

Oynanan: Kokpit'i okuma, "+" ile tahsilat (Kuzey Mobilya, 12 bin), alttan açılan sayfayı sürükleyerek kapatma, takvim, cari detayı, ekstre aktarma, 14 form ve 25 ekranın taşma taraması.

Bulunan ve düzeltilen:
- **Bildirim "+" düğmesini örtüyordu (önemli):** Kayıttan sonra çıkan "Geri al" bildirimi alt menünün üstüne oturuyor, birkaç saniye yeni kayıt girilemiyordu. Artık menünün üstünde duruyor; "+" hep tıklanabilir.
- **Nakit değişimi yanlıştı (hesap hatası):** 30 günden genç işletmede "son 30 günde ₺0 · %0" yazıyordu (açılış günündeki hareketler kıyas noktasına dahil ediliyordu). Artık "açılıştan beri −₺152.950 (−%7,2)"; elle doğrulandı: açılış ₺2.112.100 → bugün ₺1.959.150.
- **Ekstre aktarma inceleme ekranı telefonda okunmuyordu:** açıklama sütunu ~30 px'e düşüp kelime kelime alt alta yazılıyordu. Telefonda iki satır: [✓ açıklama · tarih · tutar] / [kategori seçimi].
- **Takvim:** hücrelerde tutar 3 satıra bölünüyordu ("+" / "₺45" / "bin"). Telefonda renk yoğunluğu + nokta; güne dokununca o günün ayrıntısına kayıyor.
- **Geçmiş güne dokununca sayfa 12 px yana kayıyordu:** uzun işlem açıklaması tek sütunlu ızgarayı genişletiyordu. Kök neden 5 sayfa düzeninde vardı (Takvim, Nakit akışı, Raporlar, Ayarlar, Hesap detayı); hepsi düzeltildi.
- Kurulumun yalnızca isteğe bağlı adımı kalmışken "Kurulumu tamamlayın" paneli ilk ekranı kaplıyordu (nakit görünmüyordu) → tek satırlık şerit.
- Kayıt türü seçicisinde masaüstü kaydırma çubuğu vardı; cari sayfasından "Fatura" açılınca seçili tür ekran dışında kalıyordu → çubuk gizli, kenar soluyor, seçili tür ortalanıyor.
- 360 px'te taşmalar: cari detayı panel başlığı, Ayarlar'daki yapay zekâ anahtar seçimi, senaryo türlerinde "Tekrarlayan".

Doğrulanan: sürükleyerek kapatma (uzun sürükleme kapatır, kısa sürükleme geri yaylanır), 14 formun ve 25 ekranın hiçbirinde taşma yok, kayıt penceresi 89 ms'de açılıyor.
Açık: Kaydet → pencere kapanması geliştirme sunucusunda 1,9 sn; üretim derlemesinde ölçülecek.

## S14 · Ekran boyutları (375 → 2560) — 🔧 (kullanıcının bildirdiği hata dahil)

**Kullanıcının bildirdiği:** Raporlar'daki 12 aylık tablo 1920×1080'de yarım bitiyordu. Ölçüm: tablo 1216 px, alan 1118 px, "Toplam" sütununun 114 px'inin yalnızca 16 px'i görünüyordu. Kök neden: rapor listesi 260 px'lik yan sütunu kaplıyor (altı boş), tablo dar alana sıkışıyordu.
- Rapor seçimi üst sekmelere taşındı: **1920 ve 2560'ta tablo kaydırmasız, tamamen sığıyor.**
- Sığmayan genişliklerde "Kalem" solda, "Toplam" sağda sabit; yalnızca aylar kayıyor, açılışta en güncel aylar görünüyor, kenarda gölge "devamı var" diyor. Tablo her genişlikte "Toplam" ile bitiyor.
- Bu sırada bulunanlar: sabit "Kalem" sütunu saydamdı (rakamlar altından görünüyordu), "Gelirler/Giderler" başlıkları kaydırınca kayboluyordu, telefonda iki sabit sütun aylara yer bırakmıyordu (telefonda yalnız "Kalem" sabit). Sekmeler 1366'da sığmıyordu → kısa adlar.
- Aylık grafikte ay adları telefonda çakışıyordu ("OcaŞubMar") → dar ekranda iki ayda bir.

**1024 px (öncelikli aralığın alt ucu) — ciddi sıkışma:** Kokpit'te ana rakam kesikti, "90 günde en düşük" kelime kelime alt alta, Hesaplar'da adlar tek harf; Cariler'de ad sütunu ~10 px'e düşmüş, satırlar üst üste biniyordu.
- 1024–1279 px'te yan menü (kullanıcı başka seçmediyse) kendiliğinden dar: içeriğe ~170 px.
- Kokpit rakamı panel genişliğine göre ölçekleniyor (ölçülen oran: rakam ≈ yazı boyu × 4,85); dar panelde göstergeler satır düzeninde.
- Cariler'de "Risk limiti" sütunu 1280 px ve üstünde (cari detayında her zaman var).
- 14 günlük şerit 640 px üstünde tek bakışta (768'de yarım bitiyordu); dar sütunda "10 Eki" iki satıra bölünüp su çizgisini kaydırıyordu, üç büyük damla tarih etiketinin üstüne çıkıyordu → düzeltildi (hizasızlık 0 px).
- Cariler'de "Gecikmiş" tutar yeşildi ("iyi" gibi okunuyordu) → kırmızı.

Taranan: 1024, 1180, 1280, 1366, 1440, 1920, 2560 ve 768 px'te 14 ekran — sayfa taşması, yarım kesik kaydırma bölümü ve kutusundan taşan yazı yok.
Kalıcı test: "sıkışma yok" (Kokpit rakamları, cari ad sütunu, rapor "Toplam"ı) 7 ekran boyutunda geçiyor. İlk yazdığım sürüm yanlış ölçüyordu (metnin kendi genişliği) ve her yerde kırmızıydı; düzeltildi. Eski Cariler düzeni bilerek geri getirilince test 1024'te kırmızıya düştü (144 < 180 px) — kanıt.

Ekran: `s14-1920-rapor-tablo-once.png` (önce), `s14-rapor-tablo-*.png`, `s14-1024-*.png`, `s14-14gun-*-v2.png`, `s14-rapor-sekme-*.png`

## Erişilebilirlik (WCAG 2.2 AA) — 🔧

Yöntem: axe-core (sektör standardı denetim motoru) canlı sayfalarda; açık ve koyu tema, masaüstü ve telefon, kayıt penceresi açıkken; ardından klavyeyle gezinme denetimi. Statik kod tarayıcısı da çalıştırıldı ama bulgularının çoğu yanlış alarmdı (ör. etiketleri `Field` bileşeni üzerinden geçen alanları "etiketsiz" sayıyor); bu yüzden yalnızca canlı sonuçlara güvenildi.

Bulunan ve düzeltilen:
- **Kontrast (her sayfada):** "soluk" metin rengi zeminde 2,64:1 (gereken 4,5:1). Açık temada #8a93aa → #616a82 (4,63:1), koyu temada #6c7794 → #848fab (5,03:1). 13 dosyadaki 22 kullanım tek değişkenle düzeldi.
- **Baş harf rozetleri:** hardal tonunda 2,87:1 → renk mürekkeple karıştırıldı (~5,2:1).
- **Ekran okuyucu tutarları okumuyordu:** tutar ve sayaç bileşenlerinde rolsüz `aria-label` (ve standart dışı `role="text"`) kullanılmıştı → tam tutar gizli metin olarak.
- **Nakit ritmi rozeti:** grafik `img` rolündeyken içindeki ay halkaları erişilebilirlik ağacından düşüyordu → grup + her halka adlı; klavyede 12 Tab durağı yerine tek durak, aylar arasında ok tuşları (Home/End dahil).
- **Klavyeyle kaydırılamayan tablolar:** rapor, KDV ve cari ekstresi tabloları (dar ekranda yana kayıyor) odaklanabilir bölge oldu, odak çerçevesi görünür.
- Etiketsiz dosya girişleri (yedek, fiş), sürükle-bırak alanlarında görünmeyen klavye odağı.

Doğrulanan: Kokpit'te ilk 32 Tab durağının hepsinde görünür odak, sıra mantıklı (menü → arama → kayıt → içerik). Kayıt penceresinde axe'in kontrastı hesaplayamadığı 3 öğe elle ölçüldü (geçiyor).
Kalıcı test: `e2e/erisilebilirlik.spec.ts` — 11 sayfa + 2 detay + kayıt penceresi, açık/koyu tema, masaüstü/telefon: 0 ihlal. İlk koşusu, canlı taramamın kaçırdığı iki sorunu yakaladı (telefonda KDV tablosu, cari rozet kontrastı). Soluk renk bilerek eski değerine döndürülünce test her sayfada kırmızıya düştü — kanıt.

Ekran: `a11y-cariler-acik.png`, `a11y-cariler-koyu.png`

## Güvenlik gözden geçirmesi — 🔧

Bakılanlar: HTML/betik enjeksiyonu, dışa aktarılan dosyalar, anahtar saklama, Supabase satır düzeyi güvenliği (RLS), sunucu fonksiyonları, yayın başlıkları.

Bulunan ve düzeltilen:
- **CSV formül enjeksiyonu (OWASP):** cari ekstresi CSV'ye aktarılırken açıklamalar olduğu gibi yazılıyordu; bankadan gelen `=HYPERLINK(…)` gibi bir açıklama Excel'de formül olarak çalışırdı. `= + - @` ile başlayan metinlerin başına `'` konuyor; negatif tutarlar sayı olarak kalıyor (birim testli, önce kırmızı görüldü).
- **İşletme sahipliği:** güncelleme politikası düzenleyicilere açık olduğundan bir düzenleyici işletme satırının `owner_id`'sini başka kullanıcıya yazabiliyordu. Sunucu tarafında tetikleyiciyle yalnızca sahibe izin veriliyor. (Uygulama senkronda `owner_id` göndermediği doğrulandı; senkron etkilenmez.)
- **İçerik Güvenlik Politikası (CSP) yoktu:** Vercel ve Netlify başlıklarına eklendi. Betikler yalnızca kendi dosyalarımızdan ve özetiyle izinli tema betiğinden çalışabilir; çerçeveye gömme, eklenti ve yabancı `<base>` yasak. Bağlantı kuralı bilerek geniş (yalnızca https/wss): Supabase ve "OpenAI uyumlu" yapay zekâ adresleri kullanıcı tarafından girilebiliyor.
  - Birim test: iki dosyadaki politika aynı ve tema betiğinin özeti doğru (betik değişip özet güncellenmezse test kırmızı).
  - Uçtan uca test: üretim derlemesi bu politika altında açılıyor, gezinilip kayıt penceresi açılıyor, konsolda engelleme yok; politikanın gerçekten uygulandığını kanıtlamak için özetsiz bir betiğin engellendiği de doğrulanıyor.

Sorunsuz bulunanlar: kodda `dangerouslySetInnerHTML`/`eval` yok (React tüm metni kaçışlıyor); raporlama görünümleri `security_invoker` ile RLS'ye tabi; yetkili fonksiyonlar `search_path` sabit ve sahiplik denetimli; Groq anahtarı yayın kurulumunda sunucuda (Edge Function), yalnızca giriş yapmış kullanıcıya; yedekler anahtar ve PIN içermiyor; `.env.local` git'e gitmiyor.

Bilinçli kabul edilen (belgelendi): kullanıcının yapay zekâ anahtarı hesaba bağlı saklanır (aşağıda); Supabase'de satır düzeyi güvenlikle yalnızca kullanıcının kendisi okur, sunucuda ayrıca şifrelenmez. PIN kilidi şifreleme değil gizlilik kilidi; yerel veriler tarayıcıda şifresiz (bulutta RLS ile korunur); ekip ekleme ekranı bir e-postanın kayıtlı olup olmadığını sahibine söyler; Edge Function'da kullanıcı başına hız sınırı yok (küçük ekipler için yeterli, büyürse eklenmeli).

## Kullanıcı geri bildirimi: sade Ayarlar ve yapay zekâ (2026-10-01) — 🔧

İstek: "Ayarlarda Groq API, Supabase gibi şeyleri insanlar anlamaz; Supabase kalksın. Groq ve Gemini panelden açılsın, 'Nasıl yapılır?' ile görselli anlatılsın. Bağlamanın faydası söylensin; anahtar bir kez girilsin, hep hatırlansın."

Yapılan:
- **Supabase kullanıcı ekranlarından kalktı:** bulut bağlantısı yalnızca kurulumu yapanın `.env`/Vercel ayarından gelir. Kurulmamışsa "Hesap ve eşitleme" bölümü, menü bağlantısı ve karşılama ekranındaki giriş hiç görünmez; kurulmuşsa kullanıcı yalnızca giriş yapar. Sayfa metninde "Supabase" geçmediği testle denetleniyor.
- **Yapay zekâ bölümü baştan yazıldı:** önce "Bağlayınca neler yapabilirsiniz?" (6 somut örnek; yapay zekâsız da tam çalıştığı açıkça yazılı) → 1. servis seç (Groq önerilen / Google Gemini) → 2. **"Nasıl alınır?"** → 3. yapıştır ve bağlan. Bağlıyken aynı liste "Nasıl kullanılır?" olur ve her özellikte "Dene" düğmesi doğrudan oraya götürür (komut paleti ve asistan için canlı doğrulandı). Model seçimi ve özel servis "Gelişmiş" altında.
- **"Nasıl alınır?" rehberi:** Groq 5, Gemini 4 adım; her adımda ne tıklanacağını gösteren çizim, siteyi yeni sekmede açan düğme, "Panodan yapıştır". Çizimler temsilidir (sitelerin gerçek ekranları hesap girişi gerektirdiği için alınamadı; gerçek ekran görüntüsü eklenmek istenirse yerleri hazır).
- **Gemini tam destekli** (önceden yalnızca fiş okumada): sohbet, yazarak kayıt, sınıflandırma, ses (Gemini'nin kendi API'siyle) ve fiş okuma aynı anahtarla. Canlı ölçüm (anahtarsız): Gemini ve Groq uç noktaları tarayıcıdan çağrılabiliyor. Bulunan: Gemini geçersiz anahtara 401 değil **400 + dizi gövdesi** döndürüyordu, eski kod kullanıcıya İngilizce ham mesaj gösterirdi → Türkçe "Anahtar geçersiz" (gerçek sunuculara karşı doğrulandı). Gemini şemayı reddederse "yalnızca JSON" talimatıyla bir kez yeniden denenir.
- **Anahtar tanıma:** `gsk_` Groq, `AIza` Gemini; yanlış servis seçiliyken yapıştırılırsa seçim kendiliğinden düzelir.
- **Bir kez gir, hep hatırla:**
  - Aynı tarayıcıda anahtar zaten saklanıyordu; buna ek olarak tarayıcıdan **kalıcı depolama** isteniyor (yer azalınca site verisi — defter dahil — silinmesin). Ayarlar › Veri ve yedek'te durumu görünüyor.
  - Yayından sonra hesapla: anahtar kullanıcının hesabına da yazılır (`user_settings`, yalnızca kendisi okur); başka bir tarayıcıda giriş yapınca **yeniden istenmez**. Kaldırılan anahtar hesaptan da silinir (bir sonraki girişte geri gelmez). Kurulum dosyasından gelen anahtarlar hesaba asla yüklenmez. Giriş oturumu zaten kalıcı.
  - İşletmenin kendisi sağlamak isterse: `VITE_AI_SERVER=1` ile anahtar sunucuda, kullanıcı hiçbir şey girmez.

Testler: birim (Gemini istemcisi 9, hesap eşitleme 7, ortam ayarı 3) ve uçtan uca "yapay zekâ ayarı sade" (Supabase yok, rehber adımları ve bağlantıları, anahtardan servis tanıma) — Gemini anahtar tanıma bilerek bozulunca kırmızıya düştü. Gerçek yanıtlarla deneme (S15) bir Groq/Gemini anahtarı girildiğinde yapılacak.

Ekran: `ai-fayda-1366.png`, `ai-kullanim-1366.png`, `ai-rehber-groq-*.png`, `ai-rehber-gemini-1.png`, `ai-bagli-*.png`, `ai-ayar-375.png`, `ai-rehber-375.png`

## Performans (üretim derlemesi, yerel sunucu, 1366×800) — 🔧

| Ölçüm | Süre |
|---|---|
| İlk açılış (karşılama görünür) | 175 ms · 423 KB indirme |
| Demo → Kokpit | 272 ms |
| Kayıt penceresi açılışı (5 denemenin ortancası) | 56 ms |
| Kaydın kendisi (Kaydet → "kaydedildi" bildirimi) | 36–44 ms |
| Sayfa geçişleri | 61–110 ms |

Geliştirme sunucusunda ölçülen "Kaydet → pencere kapanması 1,9 sn" ayrıştırıldı: kayıt 40 ms; kalanı kapanış animasyonu ve tahsilat/ödemelerdeki "TAHSİL EDİLDİ" mührü için **bilerek konmuş 1,1 sn bekleme**. Arka arkaya kayıt giren için uzun → 0,8 sn'ye indirildi (mühür animasyonu 0,7 sn), azaltılmış hareket tercihinde beklenmez.
İkon paketi 351 KB (sıkıştırılmış 78 KB): ağaç sallama çalışıyor (kullanılan 129 ikon = paketteki 129); boyut her ikonun 6 ağırlık çizimini taşımasından. Bir kez indirilip uzun süre önbellekte kaldığı için bırakıldı.
Not: ölçümler hızlı bir bilgisayarda; orta seviye bir telefonda birkaç kat uzun sürebilir (gerçek cihazda ölçülmedi).

## Yayın öncesi ek doğrulamalar (anahtar/SQL gerektirmeyen) — 🔧

**Safari (iPhone) ve Firefox:** test aracına WebKit ve Firefox eklendi; her test artık 9 tarayıcı/ekran bileşiminde koşuyor.
- Firefox: tüm testler ilk denemede geçti.
- Safari: ilk koşuda 17 test "demo hiç açılmıyor" diye düştü. Kök neden ölçülerek bulundu: Playwright'ın Windows WebKit derlemesinde IndexedDB satır başına ~15 ms yazıyor (Dexie'siz ham IndexedDB ile de aynı: 50 satır 0,8 sn, 200 satır 3 sn); 823 işlemlik demo ~12 sn sürüyor, beklemeler 8–10 sn'ydi. Veri doğru yazılıyor, uygulama mantığı çalışıyor; yeterli süre verilince Safari'de tüm testler geçti (ekranlar, yerleşim, kilit, kayıt, ayarlar). İki test aracı sınırlaması düzeltildi (telefon WebKit'inde fare tekerleği yok).
- Açık risk: gerçek iPhone'da toplu yazma (demo, ekstre aktarma, yedek geri yükleme) hızı ancak gerçek cihazda ölçülebilir; tek tek girilen kayıtlar etkilenmez.

**İnternetsiz çalışma (PWA):** ikinci ziyaretten itibaren bağlantı kesikken uygulama 169 ms'de açıldı; doğrudan rapor adresi, sayfa geçişleri ve yeni kayıt çalıştı; hata yok.

**Ağır veri:** demo 5 yıla ve 3 kat yoğunluğa çoğaltıldı (12.405 işlem): Kokpit 341 ms, kaydetme 55 ms (sonrasında tek 51 ms'lik hesaplama, takılma yok), sayfa geçişleri 36–128 ms, İşlemler listesi 120 satır gösterip gerisini sayfalıyor.

**Yavaş telefon (işlemci yavaşlatma + 4G):**

| | Orta seviye (4×) | Ucuz (6×) |
|---|---|---|
| İlk açılış | 1,2 sn | 1,6 sn |
| Demo → Kokpit | 1,3 sn | 2,5 sn |
| Kayıt penceresi | 0,36 sn | 0,66 sn |
| Kaydetme | 0,25 sn | 0,41 sn |
| Sayfa geçişi | 0,5–0,6 sn | ~1,1 sn |

CPU profili: sürenin çoğu JavaScript değil (uygulama + React ~100–200 ms), tarayıcının çizimi (görsel efektler). Ucuz telefonda efektleri sadeleştirme kararı gerçek cihaz görüldükten sonra verilecek. Boşta sayfa kodlarının arka planda indirilmesi eklendi (ilk ziyarette ağ beklenmez, çevrimdışında hepsi hazır); ölçülen hız kazancı ihmal edilebilir düzeyde — dürüst not.

**Gerçek Excel (.xlsx) ekstresi:** üstte rapor başlıkları, tarihler Excel tarih sayısı (bazılarında 14:35 ve 23:50 saati), tutarlar sayı. Chrome, telefon ve Firefox'ta 13 satır doğru okundu, gece 23:50'deki işlem ertesi güne kaymadı, tutar ve yönler doğru. Kodda saat dilimi hatası bilerek eklenince test kırmızıya düştü — kanıt.

## Yapay zekâ istemleri ve anahtar güvenliği (2026-10-03) — 🔧

İstek: "Anahtar nasıl saklanıyor, sızmadığını kullanıcı anlasın. İstemler (prompt) balık vermek yerine balık tutmayı öğreten, anlam çerçevesi veren biçimde mi yazıldı?"

**İstemler yeniden yazıldı** (`src/ai/prompts.ts`, hepsi tek yerde). Eskiler kısa kural listeleriydi ("collect=müşteriden tahsilat…"). Yenilerinin her biri aynı iskeleti izliyor: amaç ve okuyucu → alan kavramları → modelin sırayla soracağı karar soruları → emin değilse ne yapacağı ve nedeni → çıktı biçimi. Örnek: kayıt türü ezber eşleme yerine iki soruyla bulunuyor ("Para şimdi el değiştirdi mi, yoksa yalnızca hak/borç mu doğdu?" → "Hangi yöne ve kiminle?"); yönü sözcüğün değil fiil ve hâl ekinin belirlediği anlatılıyor ("Akın ödedi" giriş, "Akın'a ödedim" çıkış). Ekstre istemi banka dilini öğretiyor (SGK, BSMV, KKDF, POS, OTS, virman) ve yanlış eşleşmenin neden boşluktan pahalı olduğunu açıklıyor (onaylanan öneri kurala dönüşüp her ay tekrarlanır). Bugünün tarihi haftanın günüyle veriliyor ("geçen cuma" için). Değişmeyen talimat başta, tarih sonda: sağlayıcının istem önbelleği çalışır.

**İnceleme sırasında bulunan ve düzeltilen gerçek hatalar:**
- **Ad gizleme banka ekstresinde çalışmıyordu.** "Müşteri adlarını gizle" açıkken "YILDIZ GIDA A.S." (büyük harf, Türkçe karaktersiz), "Şahin'e"/"Özkan'a" (Türkçe harfle başlayan) ve "yıldız gıdadan" (küçük harf) **gizlenmeden** gidiyordu; model de listeyi "Cari-3" diye gördüğü için ekstre satırını cariyle hiç eşleştiremiyordu. Eşleştirme artık harf büyüklüğüne ve Türkçe/ASCII farkına duyarsız; iki firmaya uyan kısa adlar ("Ege") ve küçük harfli sıradan sözcükler ("mavi boya") gizlenmiyor. Eski kodla ölçüldü, 5 örnekten 4'ü gizlenmiyordu.
- **Onay ekranı "IBAN'larınız gönderilmez" diyor, hatırlatma yeniden yazımı IBAN'ı gönderiyordu.** IBAN artık `[IBAN-1]` yer tutucusuyla gidiyor, yanıtta geri konuyor; model yer tutucuyu düşürürse IBAN mesajın sonuna ekleniyor.
- **"Özetle" üç yerde aynı "sabah brifingi" talimatını alıyordu** (Kokpit brifingi, Raporlar yönetici özeti, Aylık hikâye). Her biri artık kendi amacını ve okuyucusunu biliyor; brifingde risk etiketli tespitler öne alınıyor.
- **Hatırlatma "carinin durumuna göre yeniden yazar" diyordu ama carinin durumu gönderilmiyordu.** Artık gecikme günü ve ödeme alışkanlığı (cihazda hesaplanan) tonu ayarlamak için gidiyor; mesaja yazılmıyor.
- **Ekranlar Markdown göstermiyor, model başlık/tablo/kalın yazabiliyordu.** İstemde ekranın ne gösterebildiği söyleniyor; özet ve mesajlarda kalan işaretler cihazda temizleniyor.
- **Asistanın işlem araması Türkçe ekleri kaçırıyordu** ("kira ödemeleri" → "KIRA ODEMESI" bulunamıyordu). Birebir sonuç yoksa sözcük köküyle yaklaşık aranıyor ve bu sonuçta belirtiliyor.
- **Modelin yanıtı cihazda doğrulanıyor:** yönü tutmayan kategori (gelire gider kategorisi) reddediliyor; girdide olmayan satır numarası yok sayılıyor; adlar harf büyüklüğü farkıyla da bulunuyor; cariye bağlı gelir/gider tahsilat/ödemeye çevriliyor.
- Ekstre açıklamalarına gömülü "önceki talimatları yok say" türü metinlerin veri olduğu, talimat olmadığı her istemde belirtiliyor.

**Anahtar güvenliği notu:** Ayarlar › Yapay zekâ'da anahtar kutusunun altında ve bağlıyken "Anahtarım güvende mi?" bölümü: bir kez girilir, bu tarayıcıda saklanır; yalnızca Groq'a/Google'a doğrudan gider, arada Mizan sunucusu yok; yedeklere girmez; (bulut kuruluysa) hesaba kaydedilen kopyayı yalnızca kullanıcı okur, kaldırınca silinir; güvenlik politikası dış kodu engeller ama eklentiler ve aynı oturumu kullanan biri erişebilir (ortak bilgisayarda "Kaldır"); ödeme yöntemine bağlı olmayan ücretsiz anahtar kötüye kullanılsa bile ücret çıkmaz, sağlayıcı sayfasından silinip yenilenebilir. Not yalnızca doğru olanı söylüyor: bulut kurulu değilse hesap satırı görünmüyor (testle denetleniyor).

Testler: birim 12 yeni (ad gizleme 4, istem yapısı 2, yanıt doğrulama ve IBAN 4, arama 1, Markdown 1); kategori yön koruması bilerek bozulunca 2 test kırmızıya düştü. Uçtan uca: güvenlik notu (bağlı değil/bağlı, masaüstü ve telefon; anahtarın açık hâli sayfada görünmüyor).
**Gerçek yanıt ölçümü hazır, henüz koşulmadı:** `src/ai/prompts.eval.test.ts` — 15 kayıt cümlesi ve 15 ekstre satırı, beklenen yanıtlarıyla; adlar açık ve gizli; eşik %85 alan doğruluğu ve sıfır yanlış yönlü kategori. Anahtar girildiğinde ilk iş bu koşulacak; istemler buna göre ayarlanacak.

**"Senior prompt engineer" yöntemiyle ölçüm (anahtarsız yapılabilen kısım):**

| İstem (örnek işletmeyle; aracın tahmini token sayısı) | Eski | Yeni | Tekrar eden ifade |
|---|---|---|---|
| Kayıt | 348 token | 911 (ilk sürüm 1.080; sıkılaştırıldı) | 6 → 0 |
| Ekstre (her 25 satırda) | 267 | 692 (ilk 765) | 0 |
| Asistan (her adımda) | 124 | 476 | 0 |
| Hatırlatma / özet | 57 / 54 | 368 / 303 | 0 |

- Becerinin yapısal kapısı (yeni istem ≤ eskinin 1,1 katı) **bilerek geçilmiyor**: eklenen kısım istenen anlam çerçevesi. Becerinin kuralına göre asıl karar gerçek değerlendirmede verilecek: yeni istem doğrulukta eskiyi geçmeli, eskinin doğru yaptığı hiçbir durumu bozmamalı. Bunun için değerlendirme, eski istemle aynı sette yan yana koşulabilir ve gerçek token kullanımını (önbellekten gelen dahil) servis yanıtından okuyup `docs/qa/ai-eval/` altına durum durum yazar. Düzenek sahte anahtarla denendi: istek Groq'a ulaştı, Türkçe "anahtar geçersiz" döndü, sonuç dosyası yazıldı.
- Aracın Türkçe metinde netlik/yapı puanı anlamsız (İngilizce sözcük listesine bakıyor); önerileri ("İngilizce JSON talimatı ekle", "örnek ekle", "rol ekle") becerinin kendi kurallarıyla çeliştiği için uygulanmadı: çıktı biçimi sağlayıcının şema zorlamasıyla garanti ediliyor, örnek ve rol ölçüm gerektirmedikçe eklenmiyor.
- Asistan yapılandırma denetimi **geçti**: 9 araç, en çok 5 adım, döngü riski yok. En büyük bağlam yükü "yaklaşan kalemler" sonucuydu (sonraki her adımda yeniden gidiyor): kullanılmayan alan atılıp vade yalnızca farklıysa yazılarak 4.050 → 3.217 karakter.
- İstemlerin sessizce şişmemesi için birim testi eklendi (bugünkü boyut + %10); aşan değişiklik, gerçek değerlendirmede kazandırdığını göstermeli.
- Ortam notu (uygulama hatası değil): Vitest, Windows'ta çalışma klasörü küçük sürücü harfiyle ("c:\…") verilince hiç test bulamıyor; bu yalnızca Claude Code'un başlattığı kabukta oluyor, PowerShell ve Git Bash yolu "C:" yapıyor.

Ekran: `anahtar-guvenligi.png`, `bagli.png` (test çıktıları)
