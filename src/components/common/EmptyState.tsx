import { Box, Text, Icon, VStack, Button } from '@chakra-ui/react';
import { FiInbox, FiPlus } from 'react-icons/fi';

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon = FiInbox,
}: EmptyStateProps) {
  return (
    <VStack
      spacing={6}
      py={16}
      px={8}
      textAlign="center"
      bg="white"
      borderRadius="xl"
      border="2px dashed"
      borderColor="gray.200"
    >
      <Box
        p={4}
        borderRadius="full"
        bg="gray.100"
      >
        <Icon as={icon} boxSize={12} color="gray.400" />
      </Box>

      <VStack spacing={2}>
        <Text fontSize="xl" fontWeight="bold" color="gray.600">
          {title}
        </Text>
        {message && (
          <Text fontSize="lg" color="gray.500">
            {message}
          </Text>
        )}
      </VStack>

      {actionLabel && onAction && (
        <Button
          leftIcon={<Icon as={FiPlus} />}
          colorScheme="brand"
          size="lg"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </VStack>
  );
}
