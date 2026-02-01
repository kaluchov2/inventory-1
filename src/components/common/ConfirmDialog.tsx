import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Button,
} from '@chakra-ui/react';
import { useRef } from 'react';
import { es } from '../../i18n/es';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  colorScheme?: 'red' | 'brand';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = es.actions.confirm,
  cancelText = es.actions.cancel,
  isLoading = false,
  colorScheme = 'red',
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
      size="lg"
    >
      <AlertDialogOverlay>
        <AlertDialogContent mx={4}>
          <AlertDialogHeader fontSize="2xl" fontWeight="bold">
            {title}
          </AlertDialogHeader>

          <AlertDialogBody fontSize="lg">
            {message}
          </AlertDialogBody>

          <AlertDialogFooter gap={4}>
            <Button
              ref={cancelRef}
              onClick={onClose}
              size="lg"
              variant="outline"
              isDisabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              colorScheme={colorScheme}
              onClick={onConfirm}
              size="lg"
              isLoading={isLoading}
            >
              {confirmText}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
