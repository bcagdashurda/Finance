// =============================================================================
// Mizan · ai-proxy (Supabase Edge Function) — deneme yapay zekâsı
//
// İşletmenin Groq anahtarını sunucuda tutar (tarayıcıya hiç inmez); yalnızca giriş yapmış kullanıcılar,
// kişi başı günlük sınırla (public.mizan_ai_take) kullanır. Kullanıcı Ayarlar'da kendi anahtarını
// bağlarsa uygulama doğrudan onunkini kullanır; bu işlev devreden çıkar.
//
// Kurulum:
//   1. Edge Functions › Deploy a new function › Via Editor › adı: ai-proxy › bu dosyayı yapıştırın › Deploy
//      (ya da: npx supabase functions deploy ai-proxy --use-api --project-ref <ref>)
//   2. Edge Functions › Secrets:  GROQ_API_KEY = gsk_…   (isteğe bağlı: AI_DAILY_LIMIT = 40)
//   3. Authentication › Sign In / Providers › Allow anonymous sign-ins: açık (deneme hesap açmadan çalışır)
//   Uygulama bu işlevin kurulu olduğunu kendisi anlar; Vercel'de ek ayar gerekmez.
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GROQ = 'https://api.groq.com/openai/v1';
const ALLOWED = new Set(['/chat/completions', '/audio/transcriptions', '/models']);
const EXPOSE = ['retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-mizan-trial', 'x-mizan-trial-remaining'];
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 40);

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': EXPOSE.join(', '),
};

function json(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { message } }), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Oturum doğrulama: yalnızca bu projede giriş yapmış kullanıcılar
  const authorization = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json(401, 'Deneme yapay zekâsı için Mizan’da hesabınızla giriş yapmalısınız.');

  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json(500, 'Sunucuda GROQ_API_KEY tanımlı değil (Edge Functions › Secrets).');

  const path = new URL(req.url).pathname.replace(/^.*\/ai-proxy/, '') || '/';
  if (!ALLOWED.has(path)) return json(404, 'Desteklenmeyen uç nokta');

  // Kişi başı günlük hak (model listesi sayılmaz). Dolunca yeniden denemenin anlamı yok: istemci bekleyip tekrar sormasın.
  let remaining: number | null = null;
  if (path !== '/models') {
    const { data: left, error: e } = await supabase.rpc('mizan_ai_take', { daily_limit: DAILY_LIMIT });
    if (e) return json(500, `Deneme sayacı okunamadı: ${e.message}`);
    if (left < 0) {
      return json(429, `Bugünkü deneme hakkınız doldu (günde ${DAILY_LIMIT} istek). Ayarlar › Yapay zekâ’dan kendi ücretsiz anahtarınızı bağlayın; 3 dakika sürer ve sınır kalkar.`, {
        'x-mizan-trial': 'exhausted',
      });
    }
    remaining = left;
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const upstream = await fetch(GROQ + path, {
    method: req.method,
    headers,
    body: req.method === 'GET' ? undefined : await req.arrayBuffer(),
  });

  const out = new Headers(cors);
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) out.set('Content-Type', upstreamType);
  for (const h of EXPOSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (remaining !== null) out.set('x-mizan-trial-remaining', String(remaining));
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
