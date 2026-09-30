import { LogoMark } from '@/ui/Logo';

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground" role="status" aria-label="Yükleniyor">
      <LogoMark size={72} animate />
    </div>
  );
}
