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
      p={3}
      borderRadius="lg"
      boxShadow="sm"
      border="1px"
      borderColor="gray.100"
      cursor="pointer"
      transition="all 0.2s"
      _hover={{
        borderColor: 'brand.300',
        boxShadow: 'md',
        transform: 'translateY(-2px)',
      }}
      onClick={() => onSelect(product)}
    >
      <VStack align="stretch" spacing={2}>
        {/* Product Name */}
        <Text fontWeight="medium" fontSize="sm" noOfLines={2} minH="40px">
          {product.name}
        </Text>

        {/* Badges */}
        <HStack spacing={1} flexWrap="wrap">
          <Badge colorScheme="blue" fontSize="xs">
            UPS {product.upsBatch}
          </Badge>
          <Badge colorScheme="purple" fontSize="xs">
            {getCategoryLabel(product.category)}
          </Badge>
        </HStack>

        {/* Brand/Color/Size */}
        {(product.brand || product.color || product.size) && (
          <Text fontSize="xs" color="gray.500" noOfLines={1}>
            {[product.brand, product.color, product.size].filter(Boolean).join(' / ')}
          </Text>
        )}

        {/* Price and Quantity */}
        <HStack justify="space-between" align="center">
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold" color="green.600" fontSize="md">
              {formatCurrency(product.unitPrice)}
            </Text>
            <Text fontSize="xs" color="gray.500">
              {product.availableQty} disponibles
            </Text>
          </VStack>

          {/* Add Multiple Button */}
          {onAddMultiple && (
            <IconButton
              icon={<Icon as={FiPlus} />}
              aria-label="Agregar múltiples"
              size="sm"
              colorScheme="brand"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAddMultiple(product);
              }}
            />
          )}
        </HStack>
      </VStack>
    </Box>
  );
}
