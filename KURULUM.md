# Mizan — Kurulum

Mizan hiçbir hesap açmadan çalışır: veriler bu bilgisayarın tarayıcısında durur.
Aşağıdaki iki adım **isteğe bağlıdır** ve yalnızca şu durumlarda gerekir:

| İstediğiniz | Gereken | Kim yapar | Süre |
|---|---|---|---|
| Yazarak/konuşarak kayıt, asistan, ekstre sınıflandırma, fiş okuma | **Groq ya da Gemini anahtarı** (ücretsiz) | Kullanıcı, uygulamanın içinden | 3 dk |
| Telefon + bilgisayar, ekip arkadaşı, internette yayın | **Supabase projesi** (ücretsiz) | Kurulumu yapan kişi, bir kez | 10 dk |

Kullanıcılar uygulamada hiçbir teknik ayar (sunucu adresi, Supabase) görmez; bulut bağlantısı kurulumu yapan kişinin `.env.local` / Vercel ayarından gelir.

---

## 0. Uygulamayı açmak

Proje klasöründeki **`Mizan-Baslat.bat`** dosyasına çift tıklayın. İlk seferde paketler kurulur (birkaç dakika), ardından tarayıcıda `http://localhost:5173` açılır. Siyah pencere açık kaldığı sürece uygulama çalışır.

> Bilgisayarda **Node.js** yoksa önce https://nodejs.org adresinden "LTS" sürümünü kurun.

---

## 1. Yapay zekâ — kullanıcı uygulamadan açar

Mizan'da **Ayarlar › Yapay zekâ**:
1. **Servis seçin:** Groq (önerilen; çok hızlı, sesle kayıt) ya da Google Gemini (Google hesabıyla; fiş okumada güçlü).
2. **"Nasıl alınır?"** düğmesi adım adım, çizimli bir rehber açar ve siteyi yeni sekmede açar (Groq: `console.groq.com/keys`, Gemini: `aistudio.google.com/apikey`). Ücretsizdir, kredi kartı istenmez.
3. Anahtarı yapıştırın (rehberdeki **"Panodan yapıştır"** ya da Ctrl+V) → **Bağlan** → **Anladım, aç**.

Yanlış servisin anahtarı yapıştırılırsa uygulama bunu tanır (`gsk_` Groq, `AIza` Gemini) ve seçimi kendisi düzeltir. Anahtar yalnızca o tarayıcıda saklanır ve yedek dosyalarına eklenmez. Gemini seçildiğinde müşteri adları varsayılan olarak takma adla gönderilir (ücretsiz Gemini'de Google içerikleri ürün geliştirmede kullanabilir).

*Kurulumu yapan kişi için alternatif:* `.env.local` dosyasına `VITE_GROQ_API_KEY=gsk_…` ya da `VITE_GEMINI_API_KEY=AIza…` yazılırsa anahtar hazır gelir. **Yalnızca kendi bilgisayarınızda** — internette yayınlanan sürümde bu yöntem anahtarı herkese açar (3.1'e bakın).

---

## 2. Bulut eşitleme (Supabase) — yalnızca SQL'i yapıştırmak yeter

### 2.1 Proje ve şema
1. https://supabase.com/dashboard/new → ücretsiz bir proje oluşturun. Bölge: **Central EU (Frankfurt)** (veriler AB içinde kalır).
2. Sol menüden **SQL Editor › New query** açın.
3. Proje klasöründeki **`supabase/schema.sql`** dosyasının **tamamını** yapıştırın → **Run**.
   "Success. No rows returned" görmelisiniz. Dosyayı tekrar çalıştırmak güvenlidir (var olanı bozmaz, eksikleri ekler).

### 2.2 Giriş bağlantıları (bir kez)
Hesap oluştururken doğrulama e-postası gelir; bağlantının doğru adrese dönmesi için:
- **Authentication › URL Configuration**
  - **Site URL:** `http://localhost:5173` (internette yayınlıyorsanız yayın adresiniz, ör. `https://mizan-isletmem.vercel.app`)
  - **Redirect URLs:** kullandığınız tüm adresleri ekleyin (`http://localhost:5173` ve yayın adresi).

> Ücretsiz Supabase'in yerleşik e-postası saatte birkaç iletiyle sınırlıdır. Ekipte çok kişi aynı anda kaydolacaksa **Authentication › Emails › SMTP Settings** ile kendi e-posta hizmetinizi bağlayın.

### 2.3 Mizan'a bağlama (kurulumu yapan kişi, bir kez)
1. Supabase'de **Project Settings › API** (yeni panelde **Data API** ve **API Keys**) sayfasından **Project URL** (`https://…supabase.co`) ve **anon public** (ya da **publishable**) anahtarını kopyalayın.
2. Proje klasöründeki `.env.example` dosyasını **`.env.local`** adıyla kopyalayın; `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` satırlarını doldurun. (İnternette yayında aynı iki değer Vercel'in Environment Variables bölümüne girilir — 3.2.)
3. Mizan'ı yeniden başlatın. Ayarlar'da **"Hesap ve eşitleme"** bölümü belirir. Bu değerler girilmezse bölüm hiç görünmez; uygulama yalnızca cihazda çalışır.

Kullanıcının yaptığı (teknik adım yok): **Ayarlar › Hesap ve eşitleme › Hesap oluştur** → e-postadaki doğrulama bağlantısı → **Giriş yap** → **Buluta yükle ve eşitlemeyi başlat**.
Diğer cihazda: karşılama ekranındaki **"Başka cihazda kullanıyorum: hesabıma giriş yap"** → işletmeyi indir.
Ekip arkadaşı: önce Mizan'da hesap oluşturur; sonra işletme sahibi **Hesap ve eşitleme** bölümünden e-postasını **Düzenleyici** ya da **Görüntüleyici** olarak ekler.

Giriş yapan kullanıcının yapay zekâ anahtarı hesabına da kaydedilir (`user_settings`; yalnızca kendisi okuyabilir): başka bir tarayıcıda giriş yaptığında anahtarı yeniden girmesi gerekmez. Şemayı bu özellikten önce kurduysanız `schema.sql`'i bir kez daha çalıştırmanız yeterli.

> **anon/publishable anahtar gizli değildir**; tarayıcıda görünmesi için tasarlanmıştır. Verilerin güvenliğini `schema.sql` içindeki satır düzeyi politikalar sağlar: herkes yalnızca üyesi olduğu işletmeyi görür, görüntüleyici yazamaz.

---

## 3. İnternette yayınlamak (isteğe bağlı)

### 3.1 (İsteğe bağlı) Ücretsiz deneme: yapay zekâyı sizin anahtarınızla sunun
Kullanıcılar kendi ücretsiz anahtarlarını girebilir (1. bölüm). Anahtar almadan denemeleri için **sizin anahtarınızı** açabilirsiniz. Anahtar tarayıcıya **hiç inmez**, Supabase sunucusunda durur:
1. Supabase'de **Edge Functions › Deploy a new function › Via Editor** → adı **`ai-proxy`**.
2. `supabase/functions/ai-proxy/index.ts` dosyasının tamamını yapıştırın → **Deploy**.
3. **Edge Functions › Secrets › Add new secret:** `GROQ_API_KEY` = `gsk_…` (isteğe bağlı `AI_DAILY_LIMIT` = kişi başı günlük istek, varsayılan 40).
4. Ortam değişkenlerine (Vercel) `VITE_AI_SERVER=1` ekleyin.

Nasıl çalışır: hesabıyla giriş yapan kullanıcı Ayarlar › Yapay zekâ'da **"Ücretsiz deneme"** kartını görür; verinin nereye gittiğini okuyup **"Denemeyi aç"** der (onay kullanıcıdan alınır, kurulumdan sayılmaz). Kişi başı günlük sınır dolunca "kendi ücretsiz anahtarınızı bağlayın" denir. Kullanıcı kendi anahtarını bağladığı anda o kullanılır; deneme devreden çıkar. Ücretsiz Groq kotası (günde ~1.000 istek) tüm kullanıcılar arasında paylaşılır; sınır tek kişinin tüketmesini önler (sayaç: `ai_usage` tablosu, gün Türkiye saatiyle döner).

### 3.2 Vercel'e yükleme
1. Kodu GitHub'a gönderin (`.env.local` gönderilmez; `.gitignore` bunu engeller).
2. https://vercel.com → **Add New › Project** → depoyu seçin. Ayarlar `vercel.json`'dan otomatik gelir.
3. **Environment Variables:**
   - `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` — ekleyin.
   - `VITE_AI_SERVER=1` — yalnızca 3.1'i yaptıysanız.
   - `VITE_GROQ_API_KEY` / `VITE_GEMINI_API_KEY` — **eklemeyin** (anahtar herkese görünür olur).
4. **Deploy** → çıkan adresi Supabase'de 2.2'deki **Site URL** ve **Redirect URLs**'e ekleyin.

Netlify kullanırsanız `public/_redirects` ve `public/_headers` dosyaları aynı ayarları sağlar.

---

## Güvenlik notları
- **PIN kilidi gizlilik kilididir**, şifreleme değildir: ekrana bakanı durdurur, bilgisayara erişen birinin tarayıcı verisini okumasını engellemez. PIN unutulursa tarayıcı verisini silip yedekten ya da buluttan geri yüklersiniz.
- **Yedek dosyaları** (Ayarlar › Veri ve yedek) yapay zekâ anahtarını ve PIN'i içermez; yine de mali verinizdir, güvenli yerde saklayın.
- Bulut kullanmıyorsanız tek kopya bu tarayıcıdadır: **düzenli yedek alın**.

## Sorun giderme
| Görülen | Neden / çözüm |
|---|---|
| "Email not confirmed" | Doğrulama e-postasındaki bağlantıya tıklamadınız; gelmediyse spam klasörüne ve 2.2'deki e-posta sınırına bakın. |
| Doğrulama bağlantısı "localhost'a bağlanılamadı" | 2.2'deki **Site URL** yanlış ya da Mizan çalışmıyor (`Mizan-Baslat.bat`). |
| "Invalid API key" (bulut) | Project URL ile anahtar farklı projelerden; ikisini aynı projeden kopyalayın. |
| Tablo bulunamadı / "relation does not exist" | `schema.sql` çalıştırılmamış ya da yarım kopyalanmış; tamamını yeniden **Run**. |
| Yapay zekâ: "Deneme yapay zekâsı için … giriş yapmalısınız" | `VITE_AI_SERVER=1` ama kullanıcı giriş yapmamış: Ayarlar › Hesap ve eşitleme'den giriş yapılmalı (ya da kendi anahtarını bağlamalı). |
| "Bugünkü deneme hakkınız doldu" | Kişi başı günlük deneme sınırı (`AI_DAILY_LIMIT`); ertesi gün yenilenir ya da kullanıcı kendi ücretsiz anahtarını bağlar. |
| "Anahtar geçersiz ya da yetkisiz" | Anahtar eksik/yanlış kopyalanmış ya da silinmiş; "Nasıl alınır?" rehberiyle yeni anahtar alın. |
| Yapay zekâ: "GROQ_API_KEY tanımlı değil" | 3.1 adım 3 (Secret) eksik. |
| "Ücretsiz kullanım limiti doldu" | Groq ücretsiz katmanının dakikalık sınırı; uygulama bir kez kendisi yeniden dener, olmazsa biraz bekleyin. |
