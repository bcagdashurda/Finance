import { useCallback, useEffect, useRef, useState } from 'react';

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
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.current = s;
    const ctx = new AudioContext();
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
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(s, { mimeType: mime });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      void ctx.close();
      cleanup();
      resolveStop.current?.(new Blob(chunks.current, { type: 'audio/webm' }));
    };
    rec.start();
    recorder.current = rec;
    setRecording(true);
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
