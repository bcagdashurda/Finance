# Günaydın — Mizan hazır

## 1. Uygulamayı açın
Proje klasöründeki **`Mizan-Baslat.bat`** dosyasına çift tıklayın. Tarayıcıda `http://localhost:5173` açılır. Siyah pencere açık kaldığı sürece uygulama çalışır.

İlk ekranda **“Demo işletmeyle keşfet”**e tıklayın. Dün gece demoyu açtıysanız: **Ayarlar › Veri ve yedek › Demo verisini yenile** deyin; eşik ve tempo ayarları güncellenir.

## 2. Ücretsiz yapay zekâyı bağlayın (5 dakika)
1. **https://console.groq.com/keys** adresine gidin ve Google hesabınızla giriş yapın. Kredi kartı gerekmez.
2. **Create API Key** deyin, bir ad verin ve oluşan anahtarı kopyalayın (`gsk_` ile başlar).
3. Mizan'da **Ayarlar › Yapay zekâ** bölümüne anahtarı yapıştırın, **Bağlantıyı test et** deyin ve çıkan onay penceresinde **Anladım, aç**a basın.

Bundan sonra şunlar çalışır:
- Asistan (⌘J ya da Ctrl+J)
- Sesle kayıt (⌘K ya da Ctrl+K paletinde mikrofon)
- Ekstre satırlarını sınıflandırma
- Kokpit'te sabah brifingi
- Tahsilat mesajını yeniden yazma
- Rapor yorumu

İsteğe bağlı: fiş ve fatura fotoğrafı okumak için aynı bölümde **Gemini** anahtarı ekleyin (https://aistudio.google.com/apikey). Ücretsiz katmanda Google verileri eğitimde kullanabilir; bu yüzden yalnızca fiş fotoğrafı gönderilir.

## 3. Mutlaka deneyin
- **Ctrl+K** ile paleti açıp şunu yazın: `Yıldız'dan 45 bin tahsilat yarın`, ardından Enter.
- **Nakit akışı › Senaryo** ile bir tahsilatı 30 gün geciktirin; grafiğin nasıl değiştiğine bakın.
- **Cariler › Kuzey Mobilya › Hatırlat** ile WhatsApp mesajı taslağı hazırlayın.
- **İşlemler › Ekstre içe aktar** ile bankanızın Excel ekstresini yükleyin.
- **Ayın hikâyesi** sayfasını yavaşça aşağı kaydırın.
- **Ayarlar › Güvenlik** ile PIN kilidi tanımlayın.
- **Ayarlar › Veri ve yedek › Yedeği indir**: veriler yalnızca bu tarayıcıda, düzenli yedek alın.

## 4. Bu gece yapılanlar
Kokpit, Nakit akışı (3 bantlı projeksiyon, tempo tahmini, senaryolar), Ödeme takvimi, İşlemler (ekstre içe aktarma dahil), Hesaplar, Cariler (ekstre, yaşlandırma, ödeme alışkanlığı, hatırlatma), Çek ve senet (vade merdiveni, ciro), Raporlar (gelir-gider nakit/tahakkuk, nakit akış tablosu, kategori, yaşlandırma, bütçe, KDV, döviz; Excel ve PDF), Ayın hikâyesi, Ayarlar (yapay zekâ, kategoriler/bütçe, kurlar, PIN kilidi, yedek), karşılama ekranı ve demo işletme.

Durum: **160 otomatik test geçiyor**, tip kontrolü temiz, üretim derlemesi başarılı.

## 5. Sıradaki işler (bir sonraki oturum)
1. **Ayın hikâyesi** sayfası yazıldı ama gerçek tarayıcıda görsel olarak kontrol etmeye vaktim kalmadı. Kaydırma efektlerini gözden geçireceğim.
2. Telefona kurulabilir uygulama (PWA) ve çevrimdışı çalışma.
3. Uçtan uca testler, erişilebilirlik denetimi, koyu mod ve mobil görünüm turu.
4. Kaynak kodu için git geçmişi: henüz commit yapılmadı. İsterseniz başlatırım.
5. Çok cihaz/bulut senkronu. Satış için gerekli, mimari buna hazır.

## 6. Bu uygulama satılır mı?
**Evet, ama önce birkaç şart var.** Kısa değerlendirme:

**Neden satılabilir:**
- Türk ön muhasebe programları (Paraşüt, BizimHesap, Logo İşbaşı) e-fatura ve kayda odaklı; nakit akışı projeksiyonu, senaryo ve tahsilat zekâsı neredeyse yok.
- Uluslararası nakit akışı araçları (Agicap, Float) ise çek/senet, KDV takvimi ve Türk bankası ekstrelerini bilmiyor.
- Mizan tam bu boşlukta duruyor.
- Türkiye'de yaklaşık 3,9 milyon KOBİ var (TÜİK); rakiplerin fiyatı ayda yaklaşık 150–870 TL aralığında.

**Satmadan önce gerekenler:**
- **Bulut senkronu ve çok kullanıcı:** işletmeler verisini telefon ve muhasebeciyle paylaşmak ister.
- **Banka bağlantısı:** lisanslı bir açık bankacılık aracısı üzerinden (şimdilik ekstre yükleme var).
- **Muhasebe programı entegrasyonu:** Paraşüt veya Logo'dan fatura aktarma; Mizan onların rakibi değil, üstüne takılan "nakit kokpiti" olarak konumlanmalı.
- **Hukuki hazırlık:** KVKK aydınlatma metni, kullanım koşulları, güvenlik denetimi, fatura kesebilen bir şirket.
- **Marka tescili:** "Mizan" adının TÜRKPATENT'te müsait olup olmadığı kontrol edilmeli.

**Önerilen yol:**
1. 10–20 KOBİ ile 2–3 ay ücretsiz pilot çalıştırın.
2. Hangi özelliğe para verdiklerini ölçün.
3. Ardından ayda 500–1.000 TL bandında bir "nakit akışı ve tahsilat" aboneliği deneyin.
