import { describe, expect, it } from 'vitest';
import { audioFileName, encodeWav, geminiAcceptsAudio, pickAudioMime } from './audio';

describe('ses kaydı biçimleri', () => {
  it('tarayıcının kaydedebildiği biçimi seçer (iPhone Safari: mp4)', () => {
    expect(pickAudioMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickAudioMime((t) => t.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(pickAudioMime(() => false)).toBeUndefined();
    expect(pickAudioMime(() => { throw new Error('desteklenmiyor'); })).toBeUndefined();
  });

  it('dosya adı kayıt türüne uyar (Groq uzantıya bakar)', () => {
    expect(audioFileName('audio/webm;codecs=opus')).toBe('kayit.webm');
    expect(audioFileName('audio/mp4')).toBe('kayit.m4a');
    expect(audioFileName('audio/ogg;codecs=opus')).toBe('kayit.ogg');
    expect(audioFileName('')).toBe('kayit.webm');
  });

  it('Gemini webm ve mp4 almaz, WAV alır', () => {
    expect(geminiAcceptsAudio('audio/webm;codecs=opus')).toBe(false);
    expect(geminiAcceptsAudio('audio/mp4')).toBe(false);
    expect(geminiAcceptsAudio('audio/wav')).toBe(true);
  });

  it('geçerli 16 bit mono WAV üretir', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(8); // 4 örnek × 2 bayt
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });
});

describe('ses → metin', () => {
  it('Whisper uydurmaları (sessizlik/gürültü) boş sayılır, gerçek cümle korunur', async () => {
    const { realSpeech } = await import('./client');
    expect(realSpeech(' Altyazı M.K.')).toBe('');
    expect(realSpeech('İzlediğiniz için teşekkürler.')).toBe('');
    expect(realSpeech('Abone olmayı unutmayın!')).toBe('');
    expect(realSpeech(' Yıldız’dan 45 bin tahsilat geldi. ')).toBe('Yıldız’dan 45 bin tahsilat geldi.');
  });
});
