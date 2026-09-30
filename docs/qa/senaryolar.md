# Mizan — Kullanıcı test senaryoları

Bu senaryolar, gerçek bir KOBİ sahibinin Mizan'ı nasıl kullanacağını adım adım tarif eder.
Her senaryo tarayıcıda (Playwright) gerçek kullanıcı gibi oynanır, her adımın ekran görüntüsü alınır,
sonuç ve gözlemler `QA-RAPORU.md` dosyasına yazılır. Siz de buraya senaryo ekleyebilirsiniz.

**Persona — Ayşe Kara.** Atlas Tekstil'in sahibi; 14 çalışan, yıllık ~40 milyon TL ciro.
Muhasebeyi mali müşavir yapıyor; Ayşe nakdi Excel'le ve banka uygulamalarıyla takip ediyor.
Dizüstü bilgisayar (1366×768) ve telefon (375 px) kullanıyor. Finans eğitimi yok, teknolojiye orta düzeyde yatkın.

Değerlendirme ölçütleri her senaryoda aynıdır:
- **Başarı:** Hedefe ulaştı mı, rakamlar doğru mu?
- **Kolaylık:** Kaç tıklama? Nerede duraksadı ya da ne yapacağını bilemedi?
- **Görünüm:** Taşma, kırpılma, okunmayan yazı, tutarsız bileşen var mı?
- **Performans:** Bekleme hissi var mı (>300 ms tepki, >1 sn yükleme)?

---

## S1 · İlk izlenim: "Bu uygulama ne işe yarıyor?" (1366×768)
1. Uygulamayı ilk kez açar, karşılama ekranını okur.
2. "Demo işletmeyle keşfet"e basar.
3. Kokpit'te şu üç soruya 60 saniyede cevap arar: *Şu an ne kadar param var? Önümüzdeki ay sıkışacak mıyım? Kim bana borçlu?*
4. Demoda olduğunu anlıyor mu, kendi işletmesine nasıl geçeceğini görüyor mu?

**Beklenen:** Üç sorunun cevabı ilk ekranda; demo olduğu açık; geçiş düğmesi görünür.

## S2 · Kendi işletmesini kurma ve hesaplar
1. Demodan "Kendi işletmemi kur" ile çıkar, işletmeyi kurar.
2. Başlangıç rehberini izleyerek hesap ekler: İş Bankası TL (IBAN yapıştırarak), Garanti USD döviz hesabı, merkez kasa, şirket kredi kartı (borçlu, limitli).
3. Hesaplar sayfasında toplam nakdi ve döviz dağılımını kontrol eder.

**Beklenen:** IBAN'dan banka tanınır; USD hesap TL karşılığıyla görünür; kredi kartı borcu toplamdan düşer ve limit kullanımı görünür.

## S3 · Carileri tanımlama
1. Beş müşteri ve üç tedarikçi ekler; bazılarında devir bakiyesi var.
2. Listeyi arar, filtreler, sıralar.
3. Çok sayıda cariyi Excel'den aktarmak ister.

**Beklenen:** Seri giriş hızlı; bakiyeler doğru yönde; toplu aktarım yolu var.

## S4 · Günlük kayıt: tahsilat, ödeme, gider, transfer
1. "Kayıt" düğmesiyle müşteriden tahsilat girer; açık faturaya otomatik dağıtıldığını görür.
2. Tedarikçiye ödeme, yakıt gideri, hesaplar arası transfer girer.
3. Aynı işlemleri komut paletine yazarak girer: "Yıldız'dan 45 bin tahsilat", "yarın 12 bin kira ödemesi".
4. Yanlış girdiği bir kaydı geri alır, bir kaydı düzenler.

**Beklenen:** Her kayıt 15 saniyenin altında; bakiye anında güncellenir; geri alma çalışır.

## S5 · Fatura, vade ve döviz
1. 240 bin TL satış faturası (%20 KDV, 30 gün vade) girer.
2. 5.000 USD alış faturası girer.
3. Kokpit ve nakit akışında bu kalemlerin vadesinde göründüğünü, KDV tahmininin ayın 28'ine düştüğünü kontrol eder.

## S6 · Çek ve senet
1. Müşteriden vadeli çek alır (portföy).
2. Çeki tedarikçiye ciro eder; bir başka çeki bankaya tahsile verir; biri karşılıksız çıkar.
3. Vade merdivenini ve cari bakiyelerine etkisini kontrol eder.

## S7 · Düzenli ödemeler
1. Kira, maaş ve SGK'yı şablonlardan ekler.
2. Takvimde görür; gerçekleşen bir kalemi "ödendi" olarak işaretler.

## S8 · Nakit sıkışması analizi
1. Nakit akışı sayfasında 13 haftalık projeksiyonu ve en düşük noktayı bulur.
2. "Büyük müşteri 30 gün gecikirse?" senaryosunu kurar; etkisini karşılaştırır.
3. Minimum nakit eşiğini değiştirir, uyarının değiştiğini görür.

## S9 · Gecikmiş alacak takibi
1. Kokpit'ten gecikmiş alacağı olan cariye gider.
2. Cari ekstresini inceler, ödeme alışkanlığını okur.
3. WhatsApp/e-posta hatırlatma metni hazırlar; kısmi tahsilat girer.

## S10 · Raporlar
1. Gelir-gider tablosunu (nakit ve tahakkuk), nakit akış tablosunu, KDV özetini, yaşlandırmayı açar.
2. Excel'e indirir; yazdırma görünümünü dener.

## S11 · Banka ekstresi içe aktarma
1. İş Bankası CSV ekstresini yükler; kolonlar ve kategoriler otomatik gelir.
2. Aynı dosyayı ikinci kez yükler.

**Beklenen:** İkinci yüklemede mükerrerler atlanır; açılıştan önceki satırlar bakiyeyi değiştirmez.

## S12 · Ayarlar, güvenlik, yedek
1. Kategori bütçesi tanımlar; PIN kilidi kurar ve kilidi dener.
2. Yedek alır, bir kaydı siler, yedekten geri yükler.
3. Koyu temaya geçer.

## S13 · Telefonda kullanım (375 px)
1. Kokpit'i okur; alt menüden gezinir.
2. Alttan açılan sayfayla tahsilat girer; sayfayı aşağı çekerek kapatır.
3. Takvim ve cari detayında yana taşma olmadığını kontrol eder.

## S14 · Ekran boyutları
Tüm ana sayfalar 768, 1024, 1280, 1366, 1440, 1920 ve 2560 genişlikte: taşma yok, boş alan dengeli,
yazılar okunur, tablolar sığar ya da düzgün kayar.

## S15 · Yapay zekâ *(Groq anahtarı gerekir)*
Yazarak/konuşarak kayıt, fiş okuma, asistana soru, ekstre sınıflandırma.

## S16 · Bulut eşitleme *(Supabase gerekir)*
İki tarayıcıda aynı işletme: birinde girilen kayıt diğerine geçer; çevrimdışı düzenleme sonra eşitlenir.
