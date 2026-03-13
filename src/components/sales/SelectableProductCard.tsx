import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  IconButton,
} from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getCategoryLabel } from '../../constants/categories';

interface SelectableProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddMultiple?: (product: Product) => void;
}

export function SelectableProductCard({
  product,
  onSelect,
  onAddMultiple,
}: SelectableProductCardProps) {
  return (
    <Box
      bg="white"
      p={2}
      borderRadius="lg"
      border="1px"
      borderColor="gray.100"
      cursor="pointer"
      transition="all 0.2s"
      _hover={{
        borderColor: 'brand.300',
        boxShadow: 'sm',
      }}
      onClick={() => onSelect(product)}
    >
      <VStack align="stretch" spacing={1}>
        <HStack justify="space-between" align="start" spacing={2}>
          <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>
            {product.name}
          </Text>
          {onAddMultiple && (
            <IconButton
              icon={<Icon as={FiPlus} />}
              aria-label="Agregar multiples"
              size="xs"
              colorScheme="brand"
              variant="ghost"
              h="28px"
              minH="28px"
              w="28px"
              minW="28px"
              onClick={(e) => {
                e.stopPropagation();
                onAddMultiple(product);
              }}
            />
          )}
        </HStack>

        <HStack spacing={1}>
          <Badge colorScheme="blue" fontSize="xs">
            UPS {product.upsBatch}
          </Badge>
          <Badge colorScheme="gray" fontSize="xs" noOfLines={1}>
            {getCategoryLabel(product.category)}
          </Badge>
        </HStack>

        <HStack justify="space-between">
          <Text fontWeight="bold" color="green.600" fontSize="sm">
            {formatCurrency(product.unitPrice)}
          </Text>
          <Text fontSize="xs" color="gray.500">
            {product.availableQty} disp.
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}
