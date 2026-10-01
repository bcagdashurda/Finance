import { RouterProvider } from 'react-router';
import { Tooltip } from 'radix-ui';
import { Toaster } from 'sonner';
import { FinanceProvider, useLoadStatus } from './finance';
import { router } from './router';
import { Splash } from './Splash';
import { Welcome } from '@/features/karsilama/Welcome';
import { LockGate } from './lock';
import { useMediaQuery } from '@/ui/useMediaQuery';

function Root() {
  const status = useLoadStatus();
  if (status === 'loading') return <Splash />;
  if (status === 'empty') return <Welcome />;
  return (
    <LockGate>
      <RouterProvider router={router} />
    </LockGate>
  );
}

/** lg altında alt gezinme çubuğu (64 px + güvenli alan) var: bildirimler onun üstünde dursun, "+" düğmesini örtmesin. */
const ABOVE_NAV = 'calc(76px + env(safe-area-inset-bottom))';

export function App() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  return (
    <FinanceProvider>
      <Tooltip.Provider delayDuration={250}>
        <Root />
        <Toaster
          position="bottom-right"
          offset={desktop ? 20 : { bottom: ABOVE_NAV, right: 16, left: 16 }}
          mobileOffset={{ bottom: ABOVE_NAV, right: 12, left: 12 }}
          gap={10}
          toastOptions={{
            style: {
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: '16px',
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--float-shadow)',
            },
            actionButtonStyle: { background: 'var(--cobalt)', color: 'var(--ink-inverse)', borderRadius: '10px' },
          }}
        />
      </Tooltip.Provider>
    </FinanceProvider>
  );
}
