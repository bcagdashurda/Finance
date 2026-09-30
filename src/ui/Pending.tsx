import { PageHeader } from './PageHeader';
import { Panel } from './Panel';
import { LogoMark } from './Logo';

/** Henüz tamamlanmamış ekranlar için geçici görünüm. */
export function Pending({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Panel reveal={0} className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <LogoMark size={56} animate />
        <p className="max-w-md text-sm text-muted">Bu ekran hazırlanıyor.</p>
      </Panel>
    </div>
  );
}
