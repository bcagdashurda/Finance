import { RouterProvider } from 'react-router';
import { Tooltip } from 'radix-ui';
import { Toaster } from 'sonner';
import { FinanceProvider, useLoadStatus } from './finance';
import { router } from './router';
import { Splash } from './Splash';
import { Welcome } from '@/features/karsilama/Welcome';
import { LockGate } from './lock';

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

export function App() {
  return (
    <FinanceProvider>
      <Tooltip.Provider delayDuration={250}>
        <Root />
        <Toaster
          position="bottom-right"
          offset={20}
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
