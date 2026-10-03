import { afterEach, describe, expect, it, vi } from 'vitest';
import { Masker } from './masking';
import { categorizeBatch, draftReminder as draftReminderFn, narrateInsights, parseEntryAI, plainText } from './features';
import { assistantPrompt, categorizePrompt, entryPrompt, narratePrompt, reminderPrompt, todayLine } from './prompts';
import { runTool, TOOLS } from './tools';
import { demoFinance, testAiConfig as baseConfig } from '@/test/demoFinance';

afterEach(() => vi.unstubAllGlobals());

/** Sahte yanıt verir, gönderilen istek gövdelerini toplar. */
function fakeModel(...contents: string[]) {
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const queue = [...contents];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: queue.shift() ?? '' } }] }), { status: 200 });
    }),
  );
  return bodies;
}

describe('Masker: ekstre ve günlük yazımda adlar gizlenir', () => {
  const names = ['Yıldız Gıda A.Ş.', 'Ege Tarım Kooperatifi', 'Ege Kâğıt Sanayi A.Ş.', 'Özkan Makine Servis', 'Göksu E-Ticaret', 'Boya Kimya Ltd. Şti.'];
  const m = new Masker(names, true);

  it('büyük harfli, Türkçe karaktersiz banka yazımını yakalar', () => {
    const out = m.mask('GELEN HAVALE YILDIZ GIDA A.S. FT 2026/118');
    expect(out).toBe('GELEN HAVALE Cari-1 FT 2026/118');
    expect(m.mask('GELEN EFT GOKSU E TICARET')).toBe('GELEN EFT Cari-5');
    expect(m.mask('EFT EGE KAGIT SANAYI AS')).toBe('EFT Cari-3');
  });

  it('Türkçe harfle başlayan adları ve küçük harfle yazılmış tam adı yakalar', () => {
    expect(m.mask("Özkan'a 5 bin ödedim")).toBe("Cari-4'a 5 bin ödedim");
    expect(m.mask('yıldız gıdadan 45 bin geldi')).toBe("Cari-1'dan 45 bin geldi");
  });

  it('belirsiz kısa adları ve küçük harfli sıradan sözcükleri gizlemez', () => {
    // İki "Ege …" firması var: "Ege" tek başına hangisi belli değil
    expect(m.mask("Ege'den haber yok")).toBe("Ege'den haber yok");
    // "boya" sıradan bir sözcük; yalnızca özel ad gibi yazılınca cari sayılır
    expect(m.mask('mavi boya aldım')).toBe('mavi boya aldım');
    expect(m.mask("Boya Kimya'ya ödeme")).toBe("Cari-6'ya ödeme");
  });

  it('takma adı geri çözer (büyük/küçük harf farkıyla da)', () => {
    expect(m.unmask('Cari-1 ve CARI-4')).toBe('Yıldız Gıda A.Ş. ve Özkan Makine Servis');
  });
});

describe('istemler', () => {
  it('bugünü haftanın günüyle verir (“geçen cuma” için)', () => {
    expect(todayLine('2026-10-03')).toBe('Bugün: 3 Ekim 2026, Cumartesi (2026-10-03).');
  });

  it('istemler sessizce şişmez (ücretsiz katmanın token sınırı; ölçüm: 2026-10-03 + %10 pay)', () => {
    // Bu sınırı aşan bir değişiklik, gerçek değerlendirmede (prompts.eval.test.ts) kazandırdığını göstermeli.
    // Kayıt 2.709 → 3.387 (fiilin kişisi, aktarımın iki ucu, takvim): Groq'ta kayıt doğruluğu %87–91 → %98.
    const t = '2026-10-03';
    expect(entryPrompt({ contacts: [], incomeCategories: [], expenseCategories: [], accounts: [], today: t }).length).toBeLessThanOrEqual(3730);
    expect(categorizePrompt({ incomeCategories: [], expenseCategories: [], contacts: [] }).length).toBeLessThanOrEqual(2440);
    expect(reminderPrompt({ tone: 'kararli', maxDaysLate: 12, habit: null }).length).toBeLessThanOrEqual(1640);
    for (const k of ['brifing', 'rapor', 'ay'] as const) expect(narratePrompt(k).length).toBeLessThanOrEqual(1340);
    expect(assistantPrompt({ business: 'X', today: t }).length).toBeLessThanOrEqual(2090);
    expect(JSON.stringify(TOOLS).length).toBeLessThanOrEqual(4520);
  });

  it('değişmeyen talimatlar başta, liste ve tarih sonda (önbellek dostu)', () => {
    const a = entryPrompt({ contacts: [], incomeCategories: ['Satış'], expenseCategories: ['Kira'], accounts: [], today: '2026-10-03' });
    const b = entryPrompt({ contacts: [], incomeCategories: ['Satış'], expenseCategories: ['Kira'], accounts: [], today: '2026-10-04' });
    const common = [...a].findIndex((ch, i) => ch !== b[i]);
    expect(common).toBeGreaterThan(a.length * 0.9);
    expect(assistantPrompt({ business: 'X', today: '2026-10-03' }).trimEnd().endsWith('(2026-10-03).')).toBe(true);
  });
});

describe('modelin yanıtı cihazda doğrulanır (adlar gizli)', () => {
  const config = { ...baseConfig, maskNames: true };
  const f = demoFinance(undefined, config);
  const alias = (name: string) => new Masker(f.contacts.map((c) => c.name), true).name(name)!;
  const cat = (name: string) => f.categories.find((c) => c.name === name)!.id;

  it('ekstre satırları maskelenerek gider; yön tutmayan kategori ve uydurma satır reddedilir', async () => {
    const bodies = fakeModel(
      JSON.stringify({
        items: [
          { id: 1, category: null, contact: alias('Yıldız Gıda A.Ş.') },
          { id: 2, category: 'Kira', contact: null }, // pozitif tutara gider kategorisi
          { id: 3, category: 'kira', contact: null }, // harf büyüklüğü farkı kabul
          { id: 99, category: 'Kira', contact: null }, // girdide olmayan satır
        ],
      }),
    );
    const out = await categorizeBatch(
      [
        { id: 1, description: 'GELEN HAVALE YILDIZ GIDA A.S. FT 2026/118', amount: 4_500_000 },
        { id: 2, description: 'GELEN FAST KIRA IADESI', amount: 120_000 },
        { id: 3, description: 'KIRA ODEMESI EYLUL ATASEHIR DEPO', amount: -4_200_000 },
      ],
      f,
      config,
    );
    const sent = bodies[0]!.messages[1]!.content;
    expect(sent).not.toMatch(/YILDIZ/);
    expect(sent).toContain(alias('Yıldız Gıda A.Ş.'));
    expect(out.get(1)).toEqual({ categoryId: undefined, contactId: f.contacts.find((c) => c.name === 'Yıldız Gıda A.Ş.')!.id });
    expect(out.has(2)).toBe(false);
    expect(out.get(3)?.categoryId).toBe(cat('Kira'));
    expect(out.has(99)).toBe(false);
  });

  it('cariden gelen para tahsilattır; gelir kaydına gider kategorisi yazılmaz', async () => {
    const bodies = fakeModel(
      JSON.stringify({
        kind: 'income', amount: 45000, currency: 'TRY', date: '2026-09-28', due_date: null,
        contact: alias('Yıldız Gıda A.Ş.'), category: 'Kira', account: null, description: 'Sipariş avansı',
      }),
    );
    const r = await parseEntryAI('yıldız gıdadan dün 45 bin avans geldi', f, config);
    expect(r.kind).toBe('collect');
    expect(r.contactId).toBe(f.contacts.find((c) => c.name === 'Yıldız Gıda A.Ş.')!.id);
    expect(r.categoryId).not.toBe(cat('Kira'));
    expect(r.amount).toBe(4_500_000);
    const [system, user] = bodies[0]!.messages;
    expect(system!.content).toContain('Salı (2026-09-29)');
    expect(system!.content).toContain('Gider kategorileri:');
    expect(system!.content).not.toContain('Yıldız Gıda');
    expect(user!.content).not.toMatch(/yıldız/i);
  });

  it('hatırlatmada IBAN yapay zekâya gitmez, yanıtta yerine konur; carinin alışkanlığı tonu ayarlar', async () => {
    const iban = 'TR12 0006 2000 1234 0006 2950 01';
    const draft = `Sayın Yıldız Gıda A.Ş. yetkilisi,\n\nToplam ₺45.000,00.\n\nHesap bilgilerimiz:\nMizan Gıda\n${iban}`;
    const yildiz = f.contacts.find((c) => c.name === 'Yıldız Gıda A.Ş.')!;

    const bodies = fakeModel(`Sayın ${alias('Yıldız Gıda A.Ş.')} yetkilisi,\nToplam ₺45.000,00.\n[IBAN-1]`);
    let text = await draftReminderFn({ tone: 'nazik', contactId: yildiz.id, maxDaysLate: 12, draft }, f, config);
    expect(JSON.stringify(bodies)).not.toContain('2950');
    expect(bodies[0]!.messages[0]!.content).toMatch(/en uzun gecikme 12 gün/);
    expect(text).toContain(iban);
    expect(text).toContain('Yıldız Gıda A.Ş.');

    // Model yer tutucuyu düşürürse IBAN kaybolmaz
    fakeModel('Sayın yetkili, ödemenizi bekliyoruz.');
    text = await draftReminderFn({ tone: 'resmi', draft }, f, config);
    expect(text.endsWith(`IBAN: ${iban}`)).toBe(true);
  });

  it('model yönü fiilin kişisine ters söylerse dilbilgisi kazanır ("Toros ödedi" tahsilattır)', async () => {
    fakeModel(
      JSON.stringify({
        kind: 'pay', amount: 2300000, currency: 'TRY', date: '2026-09-29', due_date: null,
        contact: alias('Toros Deterjan San. A.Ş.'), category: null, account: null, description: '',
      }),
    );
    const r = await parseEntryAI('Toros Deterjan ödedi 2 milyon 300 bin', f, config);
    expect(r.kind).toBe('collect');
  });

  it('özet türüne göre farklı amaç verir; etiketler ve Markdown temizliği', async () => {
    const bodies = fakeModel('**Nakit** 12 Ekim’de eşiğin altına iniyor.\n- Yıldız’ı arayın.');
    const text = await narrateInsights([{ title: 'Sıkışma', body: '12 Ekim', tone: 'bad' }], f, config, 'rapor');
    expect(bodies[0]!.messages[0]!.content).toContain('yönetici özeti');
    expect(bodies[0]!.messages[1]!.content).toContain('[risk] Sıkışma');
    expect(text).toBe('Nakit 12 Ekim’de eşiğin altına iniyor.\n• Yıldız’ı arayın.');
  });
});

describe('asistan aracı: işlem arama', () => {
  const f = demoFinance();
  it('Türkçe ekli sorguda köke göre yaklaşık arar', () => {
    const out = runTool('search_transactions', JSON.stringify({ query: 'kiraları' }), f, new Masker([], false)) as { bulunan: number; not?: string };
    expect(out.bulunan).toBeGreaterThan(0);
    expect(out.not).toMatch(/yaklaşık/);
  });
});

describe('plainText', () => {
  it('başlık ve kalın işaretlerini kaldırır, tireli maddeyi • yapar', () => {
    expect(plainText('## Özet\n**Önemli:** ödeme\n* bir\n- iki')).toBe('Özet\nÖnemli: ödeme\n• bir\n• iki');
  });
});
