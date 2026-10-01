# Mizan — Buradan başlayın

## 1. Uygulamayı açın
Proje klasöründeki **`Mizan-Baslat.bat`** dosyasına çift tıklayın; tarayıcıda `http://localhost:5173` açılır.
İlk ekranda **"Demo işletmeyle keşfet"** ile örnek bir işletmeyi gezebilir, hazır olduğunuzda üstteki banttan **"Kendi işletmemi kur"** ile kendi verinize geçebilirsiniz.

## 2. İsteğe bağlı iki adım
Ayrıntılı, ekran ekran anlatım: **[KURULUM.md](KURULUM.md)**
- **Yapay zekâ:** Groq'tan ücretsiz anahtar alın → Ayarlar › Yapay zekâ'ya yapıştırın. (3 dk)
- **Bulut / çok cihaz:** Supabase'de proje açın → `supabase/schema.sql`'i SQL Editor'e yapıştırıp çalıştırın → adres ve anahtarı Ayarlar › Bulut senkronu'na girin. (10 dk)

Bu ikisi olmadan da uygulama tam çalışır; veriler bu bilgisayarın tarayıcısında durur (**düzenli yedek alın**: Ayarlar › Veri ve yedek).

## 3. Nasıl test edildi
Otomatik testlere tek başına güvenmemek için uygulama, gerçek bir kullanıcı gibi tarayıcıda (Playwright) **16 senaryoyla** oynandı:
- Senaryolar: **[docs/qa/senaryolar.md](docs/qa/senaryolar.md)** (Atlas Tekstil'in sahibi Ayşe Kara'nın gözünden)
- Bulunan her hata, düzeltmesi ve kanıtı: **[docs/qa/QA-RAPORU.md](docs/qa/QA-RAPORU.md)**
- Otomatik testler yalnızca "düzelen hata geri gelmesin" diye duruyor; önemli olanlar, hata bilerek geri getirilince kırmızıya düştükleri doğrulanarak yazıldı.

Kapsanan: kurulum, hesaplar, cariler (Excel'den toplu aktarma dahil), günlük kayıt, fatura ve döviz, çek/senet, düzenli ödemeler, nakit sıkışması senaryoları, gecikmiş alacak, raporlar ve PDF, ekstre aktarma, ayarlar/PIN/yedek, koyu tema, telefon, 768 → 2560 px tüm ekranlar (öncelik 1024–1400), erişilebilirlik (WCAG 2.2 AA), güvenlik gözden geçirmesi.

Bekleyen: **S15 yapay zekâ** ve **S16 bulut eşitleme** senaryoları — Groq anahtarı ve Supabase projesi girildiğinde oynanacak.

## 4. Sizden beklenen kararlar
1. **"Sade mod"** eklensin mi? Esnaf ve serbest çalışanlar için kurulumda seçilen, çek/senet, KDV ve senaryoları gizleyen basit görünüm (yaklaşık 1 günlük iş).
2. **GitHub'a gönderme (push):** onay verdiğinizde ve depo adresini paylaştığınızda yapılır. Şu an tüm çalışma yalnızca bu bilgisayarda, yerel git geçmişinde.

## 5. Bu uygulama satılır mı?
**Evet, ama önce birkaç şart var.**

**Neden satılabilir:**
- Türk ön muhasebe programları (Paraşüt, BizimHesap, Logo İşbaşı) e-fatura ve kayda odaklı; nakit akışı projeksiyonu, senaryo ve tahsilat zekâsı neredeyse yok.
- Uluslararası nakit akışı araçları (Agicap, Float) ise çek/senet, KDV takvimi ve Türk bankası ekstrelerini bilmiyor. Mizan tam bu boşlukta duruyor.

**Satmadan önce gerekenler:**
- **Banka bağlantısı:** lisanslı bir açık bankacılık aracısı üzerinden (şimdilik ekstre yükleme var).
- **Muhasebe programı entegrasyonu:** Paraşüt veya Logo'dan fatura aktarma; Mizan onların rakibi değil, üstüne takılan "nakit kokpiti" olarak konumlanmalı.
- **Hukuki hazırlık:** KVKK aydınlatma metni, kullanım koşulları, güvenlik denetimi, fatura kesebilen bir şirket.
- **Marka tescili:** "Mizan" adının TÜRKPATENT'te müsait olup olmadığı kontrol edilmeli.

**Önerilen yol:** 10–20 KOBİ ile 2–3 ay ücretsiz pilot → hangi özelliğe para verdiklerini ölçün → ayda 500–1.000 TL bandında bir "nakit akışı ve tahsilat" aboneliği deneyin.
