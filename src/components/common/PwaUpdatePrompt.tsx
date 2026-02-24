import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  Alert,
  AlertIcon,
  AlertDescription,
  Button,
  HStack,
  CloseButton,
} from '@chakra-ui/react';
import { useState } from 'react';

export function PwaUpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || dismissed) return null;

  return (
    <Alert
      status="warning"
      position="fixed"
      top={0}
      left={0}
      right={0}
      zIndex="banner"
      py={3}
      px={4}
      borderBottomWidth="1px"
      borderBottomColor="orange.300"
    >
      <AlertIcon />
      <AlertDescription flex={1} fontSize="sm">
        Nueva versión disponible
      </AlertDescription>
      <HStack spacing={2}>
        <Button
          size="sm"
          colorScheme="orange"
          onClick={() => updateServiceWorker(true)}
        >
          Actualizar
        </Button>
        <CloseButton size="sm" onClick={() => setDismissed(true)} />
      </HStack>
    </Alert>
  );
}
