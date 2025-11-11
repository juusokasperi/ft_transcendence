import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { BrowserRouter as Browser } from 'react-router-dom';
import { AppProvider } from './context/AppContext.tsx';
import { MatchActivityProvider } from './context/MatchActivityContext';

createRoot(document.getElementById('root')!).render(
  <Browser>
    <AppProvider>
      <MatchActivityProvider>
        <App />
      </MatchActivityProvider>
    </AppProvider>
  </Browser>,
);
