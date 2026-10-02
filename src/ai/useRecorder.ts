import { useCallback, useEffect, useRef, useState } from 'react';
import { pickAudioMime } from './audio';

/** Mikrofon kaydı + canlı seviye (dalga animasyonu için). */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const resolveStop = useRef<((b: Blob) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Bu tarayıcı ses kaydını desteklemiyor; isteğinizi yazarak girebilirsiniz.');
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      throw new Error(
        (e as Error).name === 'NotAllowedError'
          ? 'Mikrofon izni verilmedi. Adres çubuğundaki simgeden izin verip tekrar deneyin.'
          : 'Mikrofona erişilemedi; başka bir uygulama kullanıyor olabilir.',
      );
    }
    stream.current = s;
    const ctx = new AudioContext();
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(1, avg / 90));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      // iPhone Safari webm kaydedemez (mp4/AAC); tarayıcının kaydedebildiği biçim seçilir
      const mime = pickAudioMime((t) => MediaRecorder.isTypeSupported(t));
      const rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        void ctx.close();
        cleanup();
        resolveStop.current?.(new Blob(chunks.current, { type: rec.mimeType || mime || 'audio/webm' }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      // Kayıt başlamazsa mikrofon açık kalmasın
      void ctx.close();
      cleanup();
      throw new Error('Ses kaydı başlatılamadı; isteğinizi yazarak girebilirsiniz.');
    }
  }, [cleanup]);

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        resolveStop.current = resolve;
        recorder.current?.stop();
        setRecording(false);
      }),
    [],
  );

  return { recording, level, start, stop };
}
