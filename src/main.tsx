import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './styles/effects.css';
import { applyTheme, useUI } from '@/app/ui-store';
import { App } from '@/app/App';

applyTheme(useUI.getState().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
