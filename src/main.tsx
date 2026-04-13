import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

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
