import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Workbox } from "workbox-window";

async function bootstrap() {
  const providerModule = import.meta.env.VITE_TEST_MODE === "mock"
    ? await import("./testing/mockFirebase")
    : await import("./contexts/FirebaseContext");

  const { FirebaseProvider } = providerModule;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <FirebaseProvider>
          <App />
        </FirebaseProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrap();

const shouldRegisterServiceWorker = import.meta.env.PROD && import.meta.env.VITE_TEST_MODE !== "mock";

if (shouldRegisterServiceWorker && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const wb = new Workbox("/sw.js");
    wb.addEventListener("waiting", () => {
      const shouldReload = window.confirm("An update is available. Reload now?");
      if (shouldReload) {
        wb.addEventListener("controlling", () => window.location.reload());
        void wb.messageSkipWaiting();
      }
    });
    void wb.register();
  });
}
