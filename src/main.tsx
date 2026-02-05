import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { theme } from './theme';

// Register diagnostic tools for console access
import './utils/syncDiagnostics';

// Register service worker with auto-update
const updateSW = registerSW({
  onRegisteredSW(swUrl, registration) {
    console.log('[PWA] SW registered:', swUrl);
    // Check for updates every hour
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline');
  },
  onNeedRefresh() {
    console.log('[PWA] New content available, updating...');
    updateSW(true);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <App />
    </ChakraProvider>
  </React.StrictMode>
);
