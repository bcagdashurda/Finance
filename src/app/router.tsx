import { createBrowserRouter, isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AppShell } from './AppShell';
import { Splash } from './Splash';

const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => {
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
      { index: true, lazy: page(() => import('@/features/kokpit/KokpitPage')) },
      { path: 'akis', lazy: page(() => import('@/features/akis/AkisPage')) },
      { path: 'takvim', lazy: page(() => import('@/features/takvim/TakvimPage')) },
      { path: 'islemler', lazy: page(() => import('@/features/islemler/IslemlerPage')) },
      { path: 'hesaplar', lazy: page(() => import('@/features/hesaplar/HesaplarPage')) },
      { path: 'hesaplar/:id', lazy: page(() => import('@/features/hesaplar/HesapDetayPage')) },
      { path: 'cariler', lazy: page(() => import('@/features/cariler/CarilerPage')) },
      { path: 'cariler/:id', lazy: page(() => import('@/features/cariler/CariDetayPage')) },
      { path: 'cekler', lazy: page(() => import('@/features/cekler/CeklerPage')) },
      { path: 'raporlar', lazy: page(() => import('@/features/raporlar/RaporlarPage')) },
      { path: 'hikaye', lazy: page(() => import('@/features/hikaye/HikayePage')) },
      { path: 'ayarlar', lazy: page(() => import('@/features/ayarlar/AyarlarPage')) },
      { path: '*', element: <RouteError /> },
    ],
  },
]);
