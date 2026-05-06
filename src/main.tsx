import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SelfHostSetup } from './components/SelfHostSetup';
import { Workbox } from "workbox-window";
import { getEnvFirebaseConfig, getStoredFirebaseConfig, initFirebase } from './firebase';

async function bootstrap() {
  let FirebaseProviderImport: React.FC<{ children: React.ReactNode }> | null = null;

  if (import.meta.env.VITE_TEST_MODE === "mock") {
    const providerModule = await import("./testing/mockFirebase");
    FirebaseProviderImport = providerModule.FirebaseProvider;
  } else {
    const providerModule = await import("./contexts/FirebaseContext");
    FirebaseProviderImport = providerModule.FirebaseProvider;
  }

  const FireProvider = FirebaseProviderImport!;

  const envConfig = getEnvFirebaseConfig();
  const storedConfig = getStoredFirebaseConfig();

  function AppShell() {
    const [mode, setMode] = useState<"setup" | "app">(() => {
      if (envConfig || storedConfig) return "app";
      return "setup";
    });

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

  if (envConfig) {
    initFirebase(envConfig);
  } else if (storedConfig) {
    initFirebase(storedConfig);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppShell />
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
