import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  AlertIcon,
  AlertDescription,
  Button,
  HStack,
  CloseButton,
  useToast,
} from '@chakra-ui/react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installHandler = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      toast({
        title: 'App instalada correctamente',
        status: 'success',
        duration: 3000,
      });
    };

    window.addEventListener('appinstalled', installHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installHandler);
    };
  }, [toast]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'dismissed') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    localStorage.setItem(DISMISS_KEY, 'true');
  }, []);

  if (!showPrompt) return null;

  return (
    <Alert
      status="info"
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex="banner"
      py={3}
      px={4}
      borderTopWidth="1px"
      borderTopColor="blue.200"
    >
      <AlertIcon />
      <AlertDescription flex={1} fontSize="sm">
        Instalar esta aplicacion para acceso rapido
      </AlertDescription>
      <HStack spacing={2}>
        <Button size="sm" colorScheme="blue" onClick={handleInstall}>
          Instalar
        </Button>
        <CloseButton size="sm" onClick={handleDismiss} />
      </HStack>
    </Alert>
  );
}
