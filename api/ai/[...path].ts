// =============================================================================
// Mizan · Ücretsiz deneme (Vercel sunucu işlevi: /api/ai/*)
//
// İşletmenin Groq anahtarı Vercel'in sunucu tarafı ortam değişkeninde (GROQ_API_KEY, VITE_ öneksiz) durur;
// sitenin koduna ve tarayıcıya hiç inmez. Demo işletmede yapay zekâ bununla kendiliğinden çalışır; kullanıcının
// kendi işletmesinde "Ücretsiz deneme ile aç" düğmesiyle açılır. Süre ve kişi başı sınır yoktur; Groq'un ücretsiz
// katmanının kendi ortak sınırı geçerlidir (dolarsa o gün durur, ertesi gün yenilenir).
//
// Vercel ortam değişkeni: GROQ_API_KEY. Uygulama /api/ai/status ile denemenin açık olup olmadığını kendisi anlar.
// =============================================================================
export const config = { runtime: 'edge' };

const GROQ = 'https://api.groq.com/openai/v1';
const ALLOWED = new Set(['/chat/completions', '/audio/transcriptions']);
/** Uygulamanın kullandığı modeller; başka modelle ortak kota tüketilmesin */
const MODELS = /^(openai\/gpt-oss-(20b|120b)|whisper-large-v3(-turbo)?)$/;
const PASS = ['content-type', 'retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens'];
const MAX_BODY = 4 * 1024 * 1024;

const env = (k: string): string | undefined => process.env[k]?.trim() || undefined;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
const fail = (status: number, message: string) => json(status, { error: { message } });

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/ai/, '') || '/';
  const groqKey = env('GROQ_API_KEY');

  if (path === '/status') return json(200, { available: Boolean(groqKey) });
  if (req.method !== 'POST' || !ALLOWED.has(path)) return fail(404, 'Desteklenmeyen uç nokta');
  if (!groqKey) return fail(503, 'Ücretsiz deneme şu an kapalı. Ayarlar › Yapay zekâ’dan kendi ücretsiz anahtarınızı bağlayabilirsiniz.');

  // Başka sitelerden tarayıcı istekleri kabul edilmez (aynı site her POST'ta Origin gönderir)
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== url.host) return fail(403, 'Bu işlev yalnızca Mizan’dan kullanılabilir.');

  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_BODY) return fail(413, 'İstek çok büyük.');
  const contentType = req.headers.get('content-type') ?? '';
  if (path === '/chat/completions') {
    let model = '';
    try {
      model = String((JSON.parse(new TextDecoder().decode(body)) as { model?: unknown }).model ?? '');
    } catch {
      return fail(400, 'İstek okunamadı.');
    }
    if (!MODELS.test(model)) return fail(400, 'Denemede bu model kullanılamaz.');
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${groqKey}` };
  if (contentType) headers['Content-Type'] = contentType;
  const upstream = await fetch(GROQ + path, { method: 'POST', headers, body });
  const out = new Headers({ 'Cache-Control': 'no-store' });
  for (const h of PASS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
