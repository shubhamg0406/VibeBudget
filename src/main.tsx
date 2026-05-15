import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SelfHostSetup } from './components/SelfHostSetup';
import { Workbox } from "workbox-window";

async function bootstrap() {
  let FirebaseProviderImport: React.FC<{ children: React.ReactNode }> | null = null;

  if (import.meta.env.VITE_TEST_MODE === "mock") {
    const providerModule = await import("./testing/mockSupabase");
    FirebaseProviderImport = providerModule.SupabaseProvider;
  } else {
    const providerModule = await import("./contexts/SupabaseContext");
    FirebaseProviderImport = providerModule.SupabaseProvider;
  }

  const FireProvider = FirebaseProviderImport!;

  function AppShell() {
    const [mode, setMode] = useState<"setup" | "app">("app");

    if (mode === "setup") {
      return (
        <ErrorBoundary>
          <SelfHostSetup
            onComplete={() => setMode("app")}
          />
        </ErrorBoundary>
      );
    }

    return (
      <ErrorBoundary>
        <FireProvider>
          <App />
        </FireProvider>
      </ErrorBoundary>
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </StrictMode>,
  );
}

bootstrap();

const shouldRegisterServiceWorker = import.meta.env.PROD && import.meta.env.VITE_TEST_MODE !== "mock";

if (shouldRegisterServiceWorker && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const wb = new Workbox("/sw.js");
    wb.addEventListener("waiting", () => {
      wb.addEventListener("controlling", () => window.location.reload());
      void wb.messageSkipWaiting();
    });
    void wb.register();
  });
}
