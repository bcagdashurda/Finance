# Mizan — Kurulum

Mizan hiçbir hesap açmadan çalışır: veriler bu bilgisayarın tarayıcısında durur.
Aşağıdaki iki adım **isteğe bağlıdır** ve yalnızca şu durumlarda gerekir:

| İstediğiniz | Gereken | Süre |
|---|---|---|
| Yazarak/konuşarak kayıt, asistan, ekstre sınıflandırma | **Groq anahtarı** (ücretsiz) | 3 dk |
| Telefon + bilgisayar, ekip arkadaşı, internette yayın | **Supabase projesi** (ücretsiz) | 10 dk |

---

## 0. Uygulamayı açmak

Proje klasöründeki **`Mizan-Baslat.bat`** dosyasına çift tıklayın. İlk seferde paketler kurulur (birkaç dakika), ardından tarayıcıda `http://localhost:5173` açılır. Siyah pencere açık kaldığı sürece uygulama çalışır.

> Bilgisayarda **Node.js** yoksa önce https://nodejs.org adresinden "LTS" sürümünü kurun.

---

## 1. Yapay zekâ (Groq) — yalnızca anahtarı yapıştırmak yeter

1. https://console.groq.com/keys adresine gidin, Google hesabınızla giriş yapın (kredi kartı istenmez).
2. **Create API Key** → bir ad verin → oluşan anahtarı kopyalayın (`gsk_` ile başlar).
3. Mizan'da **Ayarlar › Yapay zekâ** bölümünde anahtar **"Bu cihazda"** seçiliyken anahtarı yapıştırın.
4. **Bağlantıyı test et** → çıkan pencerede **Anladım, aç**.

Bu kadar. Anahtar yalnızca bu tarayıcıda saklanır ve yedek dosyalarına eklenmez.

*Alternatif:* proje klasöründeki `.env.example` dosyasını `.env.local` adıyla kopyalayıp `VITE_GROQ_API_KEY=gsk_…` satırını doldurabilirsiniz. **Bunu yalnızca kendi bilgisayarınızda yapın** — internette yayınlanan sürümde bu yöntem anahtarı herkese açar (aşağıda 3. bölüm).

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

### 2.3 Mizan'a bağlama
1. Supabase'de **Project Settings › API** (yeni panelde **Data API** ve **API Keys**) sayfasından:
   - **Project URL** (`https://…supabase.co`)
   - **anon public** (ya da **publishable**) anahtarını kopyalayın.
2. Mizan'da **Ayarlar › Bulut senkronu** → iki değeri yapıştırın.
3. **Hesap oluştur** → e-postadaki doğrulama bağlantısına tıklayın → **Giriş yap**.
4. **Buluta yükle ve eşitlemeyi başlat**. Sonraki değişiklikler her cihazda kendiliğinden eşitlenir.

Diğer cihazda: aynı Project URL/anahtarla giriş yapın → **Buluttaki işletmelerim** listesinden işletmeyi indirin.
Ekip arkadaşı eklemek: arkadaşınız önce Mizan'da hesap oluşturur, sonra siz **Bulut senkronu** bölümünden e-postasını **Düzenleyici** ya da **Görüntüleyici** olarak eklersiniz.

> **anon/publishable anahtar gizli değildir**; tarayıcıda görünmesi için tasarlanmıştır. Verilerin güvenliğini `schema.sql` içindeki satır düzeyi politikalar sağlar: herkes yalnızca üyesi olduğu işletmeyi görür, görüntüleyici yazamaz.

---

## 3. İnternette yayınlamak (isteğe bağlı)

### 3.1 Yapay zekâ anahtarını sunucuya taşıyın
Yayındaki sitede Groq anahtarı tarayıcıya **inmemeli**:
1. Supabase'de **Edge Functions › Deploy a new function › Via Editor** → adı **`ai-proxy`**.
2. `supabase/functions/ai-proxy/index.ts` dosyasının tamamını yapıştırın → **Deploy**.
   (Aynı kod Mizan'da **Ayarlar › Yapay zekâ › Bulut sunucusunda** bölümünde kopyalanabilir hâlde de var.)
3. **Edge Functions › Secrets › Add new secret:** `GROQ_API_KEY` = `gsk_…`
4. Mizan'da **Ayarlar › Yapay zekâ** → **"Bulut sunucusunda"** seçin. Yalnızca giriş yapmış kullanıcılar kullanabilir.

### 3.2 Vercel'e yükleme
1. Kodu GitHub'a gönderin (`.env.local` gönderilmez; `.gitignore` bunu engeller).
2. https://vercel.com → **Add New › Project** → depoyu seçin. Ayarlar `vercel.json`'dan otomatik gelir.
3. **Environment Variables:**
   - `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` — ekleyin.
   - `VITE_GROQ_API_KEY` — **eklemeyin** (anahtar herkese görünür olur; 3.1'deki yolu kullanın).
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
| Yapay zekâ: "Mizan'da giriş yapmalısınız" | "Bulut sunucusunda" seçili ama bulutta oturum yok: Ayarlar › Bulut senkronu'ndan giriş yapın. |
| Yapay zekâ: "GROQ_API_KEY tanımlı değil" | 3.1 adım 3 (Secret) eksik. |
| "Ücretsiz kullanım limiti doldu" | Groq ücretsiz katmanının dakikalık sınırı; uygulama bir kez kendisi yeniden dener, olmazsa biraz bekleyin. |
