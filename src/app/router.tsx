import { createBrowserRouter, isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AppShell } from './AppShell';
import { Splash } from './Splash';
import { PAGES, type PageModule } from './pages';

const page = (loader: PageModule) => async () => {
  const m = await loader();
  return { Component: m.default };
};

function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.status === 404
      ? 'Bu sayfa bulunamadı.'
      : error.statusText
    : error instanceof Error
      ? error.message
      : 'Beklenmeyen bir hata oluştu.';
  return (
    <div className="mx-auto max-w-lg py-24 text-center">
      <h1 className="display text-4xl">Bir şeyler ters gitti</h1>
      <p className="mt-3 text-sm text-muted">{message}</p>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-cobalt-ink underline">
        Kokpite dön
      </Link>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    hydrateFallbackElement: <Splash />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(PAGES.kokpit) },
      { path: 'akis', lazy: page(PAGES.akis) },
      { path: 'takvim', lazy: page(PAGES.takvim) },
      { path: 'islemler', lazy: page(PAGES.islemler) },
      { path: 'hesaplar', lazy: page(PAGES.hesaplar) },
      { path: 'hesaplar/:id', lazy: page(PAGES.hesapDetay) },
      { path: 'cariler', lazy: page(PAGES.cariler) },
      { path: 'cariler/:id', lazy: page(PAGES.cariDetay) },
      { path: 'cekler', lazy: page(PAGES.cekler) },
      { path: 'raporlar', lazy: page(PAGES.raporlar) },
      { path: 'hikaye', lazy: page(PAGES.hikaye) },
      { path: 'ayarlar', lazy: page(PAGES.ayarlar) },
      { path: '*', element: <RouteError /> },
    ],
  },
]);
