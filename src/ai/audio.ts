/**
 * Ses kaydı biçimleri. Tarayıcılar farklı kaydeder (Chrome/Firefox: webm/Opus, iPhone Safari: mp4/AAC);
 * servisler türü dosya adından da anlar. Gemini belgelerine göre webm ve mp4 kabul etmez: kayıt
 * gönderilmeden cihazda 16 kHz mono WAV'a çevrilir (konuşma için yeterli, 30 sn ≈ 1 MB).
 */

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** Tarayıcının kaydedebildiği ilk biçim; hiçbiri bilinmiyorsa tarayıcının varsayılanı (undefined). */
export function pickAudioMime(isSupported: (type: string) => boolean): string | undefined {
  return CANDIDATES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  });
}

/** Kayıt türüne uygun dosya adı (Groq Whisper uzantıya da bakar). */
export function audioFileName(type: string): string {
  const t = type.toLowerCase();
  if (/mp4|m4a|aac/.test(t)) return 'kayit.m4a';
  if (t.includes('ogg')) return 'kayit.ogg';
  if (t.includes('wav')) return 'kayit.wav';
  if (/mpeg|mp3/.test(t)) return 'kayit.mp3';
  return 'kayit.webm';
}

/** Gemini'nin kabul ettiği ses türleri (WAV, MP3, AIFF, AAC, OGG, FLAC). */
export const geminiAcceptsAudio = (type: string) => /^audio\/(wav|x-wav|mp3|mpeg|aiff|aac|ogg|flac)\b/i.test(type);

/** 16 bit PCM, tek kanal WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt bölümü uzunluğu
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // tek kanal
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // bayt/sn
  v.setUint16(32, 2, true); // blok hizası
  v.setUint16(34, 16, true); // bit derinliği
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => {
    const s = Math.max(-1, Math.min(1, x));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  });
  return new Uint8Array(buf);
}

/** Tarayıcıda: kaydı çözüp 16 kHz mono WAV'a çevirir. */
export async function toWav(blob: Blob, sampleRate = 16000): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * sampleRate)), sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), sampleRate)], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}
