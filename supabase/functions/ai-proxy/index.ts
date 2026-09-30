// =============================================================================
// Mizan · ai-proxy (Supabase Edge Function)
//
// Groq API anahtarını sunucuda tutar; yalnızca giriş yapmış kullanıcılar kullanabilir.
// Kurulum (Supabase panelinden, komut satırı gerekmez):
//   1. Edge Functions › Deploy a new function › Via Editor
//   2. Fonksiyon adı:  ai-proxy   — bu dosyanın tamamını yapıştırın › Deploy
//   3. Edge Functions › Secrets › Add new secret:  GROQ_API_KEY = gsk_…
//   4. Mizan › Ayarlar › Yapay zekâ › “Bulut sunucusu” seçeneğini açın.
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GROQ = 'https://api.groq.com/openai/v1';
const ALLOWED = new Set(['/chat/completions', '/audio/transcriptions', '/models']);
const EXPOSE = ['retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens'];

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': EXPOSE.join(', '),
};

function json(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Oturum doğrulama: yalnızca bu projede giriş yapmış kullanıcılar
  const authorization = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json(401, 'Yapay zekâ için Mizan’da giriş yapmalısınız.');

  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json(500, 'Sunucuda GROQ_API_KEY tanımlı değil (Edge Functions › Secrets).');

  const path = new URL(req.url).pathname.replace(/^.*\/ai-proxy/, '') || '/';
  if (!ALLOWED.has(path)) return json(404, 'Desteklenmeyen uç nokta');

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
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
