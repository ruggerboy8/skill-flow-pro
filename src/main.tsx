import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Conditional imports for dev tools
const enableSimTools = import.meta.env.VITE_ENABLE_SIMTOOLS === 'true';

async function renderApp() {
  if (enableSimTools) {
    const { NowProvider } = await import('./providers/NowProvider');
    const { SimProvider, useSim } = await import('./devtools/SimProvider');
    const { SimBanner } = await import('./devtools/SimConsole');
    
    function AppWithDevTools() {
      return (
        <SimProvider>
          <SimTimeWrapper>
            <SimBanner />
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
