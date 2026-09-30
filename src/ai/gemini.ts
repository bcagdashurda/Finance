/**
 * İsteğe bağlı: Gemini ile fiş/fatura fotoğrafı okuma. Ücretsiz katmanda Google
 * girdileri model eğitiminde kullanabilir; bu yüzden ayrı onay istenir ve yalnızca
 * fotoğraf gönderilir (defter verisi gönderilmez).
 */
import { AiError } from './client';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface ReceiptData {
  vendor: string | null;
  date: string | null;
  total: number | null;
  vat_total: number | null;
  vat_rate: number | null;
  currency: string | null;
  document_no: string | null;
  tax_id: string | null;
  category_hint: string | null;
  kind: 'expense_receipt' | 'purchase_invoice' | 'sales_invoice' | 'unknown';
}

export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) throw new AiError(res.status === 400 || res.status === 403 ? 'auth' : 'server', 'Gemini anahtarı doğrulanamadı.');
  const json = await res.json();
  return (json.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: { name: string }) => m.name.replace('models/', ''))
    .filter((n: string) => /flash/.test(n) && !/image|tts|audio|live|embedding/.test(n))
    .sort()
    .reverse();
}

async function toBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function readReceipt(apiKey: string, model: string, image: Blob): Promise<ReceiptData> {
  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: image.type || 'image/jpeg', data: await toBase64(image) } },
          {
            text: 'Bu bir Türk fişi, e-arşiv faturası ya da faturadır. Alanları çıkar. Tutarlar ana birimde sayı (ör. 1234.56). Tarih YYYY-AA-GG. Bilinmeyeni null bırak. kind: gider fişi=expense_receipt, alış faturası=purchase_invoice, satış faturası=sales_invoice.',
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          vendor: { type: 'STRING', nullable: true },
          date: { type: 'STRING', nullable: true },
          total: { type: 'NUMBER', nullable: true },
          vat_total: { type: 'NUMBER', nullable: true },
          vat_rate: { type: 'NUMBER', nullable: true },
          currency: { type: 'STRING', nullable: true },
          document_no: { type: 'STRING', nullable: true },
          tax_id: { type: 'STRING', nullable: true },
          category_hint: { type: 'STRING', nullable: true },
          kind: { type: 'STRING', enum: ['expense_receipt', 'purchase_invoice', 'sales_invoice', 'unknown'] },
        },
        required: ['kind'],
      },
    },
  };
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('network', 'Gemini servisine ulaşılamadı.');
  }
  if (res.status === 429) throw new AiError('rate', 'Gemini ücretsiz limiti doldu; biraz sonra deneyin.');
  if (!res.ok) throw new AiError(res.status === 400 || res.status === 403 ? 'auth' : 'server', 'Gemini fişi okuyamadı.');
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text) as ReceiptData;
}
