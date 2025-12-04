import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global error listener for chunk loading failures (stale deployment recovery)
window.addEventListener('error', (event) => {
  const isChunkError = 
    event.message?.includes('dynamically imported module') || 
    event.message?.includes('Importing a module script failed') ||
    event.message?.includes('Failed to fetch dynamically imported module');

  if (isChunkError) {
    event.preventDefault();
    
    // LOOP GUARD: Prevent infinite reload if error is persistent
    const storageKey = 'app_reload_timestamp';
    const lastReload = sessionStorage.getItem(storageKey);
    const now = Date.now();

    if (lastReload && now - parseInt(lastReload) < 10000) {
      console.error('Chunk load failed, but reload loop detected. Halting auto-refresh.');
      return;
    }

    sessionStorage.setItem(storageKey, now.toString());
    window.location.reload();
  }
});

// Conditional imports for dev tools
const enableSimTools = import.meta.env.VITE_ENABLE_SIMTOOLS === 'true';

async function renderApp() {
  if (enableSimTools) {
    const { NowProvider } = await import('./providers/NowProvider');
    const { SimProvider, useSim } = await import('./devtools/SimProvider');
    
    function AppWithDevTools() {
      return (
        <SimProvider>
          <SimTimeWrapper>
            <App />
          </SimTimeWrapper>
        </SimProvider>
      );
    }
    
    function SimTimeWrapper({ children }: { children: React.ReactNode }) {
      const { simulatedTime } = useSim();
      return (
        <NowProvider simulatedTime={simulatedTime}>
          {children}
        </NowProvider>
      );
    }
    
    createRoot(document.getElementById("root")!).render(<AppWithDevTools />);
  } else {
    createRoot(document.getElementById("root")!).render(<App />);
  }
}

renderApp();
