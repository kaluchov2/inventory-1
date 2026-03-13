import { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  SimpleGrid,
  Text,
  Button,
  ButtonGroup,
  Icon,
  Flex,
} from '@chakra-ui/react';
import { FiFilter, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { AutocompleteSelect, SearchInput } from '../common';
import { SelectableProductCard } from './SelectableProductCard';
import { useProductStore } from '../../store/productStore';
import { Product, CategoryCode } from '../../types';
import { CATEGORY_OPTIONS, getCategoryLabel } from '../../constants/categories';
import { UPS_FILTER_OPTIONS } from '../../constants/colors';

interface ProductFilterPanelProps {
  onSelectProduct: (product: Product) => void;
  onAddMultiple?: (product: Product) => void;
}

const PRODUCTS_PER_PAGE = 8;

export function ProductFilterPanel({
  onSelectProduct,
  onAddMultiple,
}: ProductFilterPanelProps) {
  const { products } = useProductStore();

  // Filter state
  const [selectedUps, setSelectedUps] = useState<number | ''>('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryCode | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Get available products only (using qty column)
  const availableProducts = useMemo(
    () => products.filter((p) => p.availableQty > 0),
    [products]
  );

  // Get unique UPS batches from available products, always including UPS 0
  const availableUpsOptions = useMemo(() => {
    const upsBatches = new Set(availableProducts.map((p) => Number(p.upsBatch)));
    return UPS_FILTER_OPTIONS.filter(
      (opt) => opt.value === 0 || upsBatches.has(Number(opt.value))
    );
  }, [availableProducts]);

  // Get categories available for the selected UPS
  const availableCategoryOptions = useMemo(() => {
    let productsToCheck = availableProducts;

    // Filter by UPS if selected
    if (selectedUps !== '') {
      productsToCheck = productsToCheck.filter((p) => Number(p.upsBatch) === Number(selectedUps));
    }

    const categories = new Set(productsToCheck.map((p) => p.category));
    return CATEGORY_OPTIONS.filter((opt) => categories.has(opt.value as CategoryCode));
  }, [availableProducts, selectedUps]);

  // Filter products based on selections
  const filteredProducts = useMemo(() => {
    let filtered = availableProducts;

    // Filter by UPS (required first for cascading)
    if (selectedUps !== '') {
      const filterUps = Number(selectedUps);
      filtered = filtered.filter((p) => Number(p.upsBatch) === filterUps);
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query) ||
          p.barcode?.toLowerCase().includes(query)
      );
    }

    // Sort by updatedAt descending
    return filtered.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [availableProducts, selectedUps, selectedCategory, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Reset page when filters change
  const handleUpsChange = (value: string | number | '') => {
    setSelectedUps(value === '' ? '' : Number(value));
    setSelectedCategory(''); // Reset category when UPS changes
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string | number | '') => {
    setSelectedCategory(value as CategoryCode | '');
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSelectedUps('');
    setSelectedCategory('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasFilters =
    selectedUps !== '' || selectedCategory !== '' || searchQuery.trim().length > 0;
  const shouldShowResults = hasFilters;

  return (
    <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
      <VStack spacing={4} align="stretch">
        {/* Filter Header */}
        <Text fontWeight="semibold" fontSize="lg">
          Seleccionar Producto
        </Text>

        {/* Filters */}
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          {/* UPS Filter (Primary) */}
          <AutocompleteSelect
            options={availableUpsOptions}
            value={selectedUps}
            onChange={handleUpsChange}
            placeholder="Seleccionar UPS..."
            size="md"
          />

          {/* Category Filter (Secondary - filtered by UPS) */}
          <AutocompleteSelect
            options={availableCategoryOptions}
            value={selectedCategory}
            onChange={handleCategoryChange}
            placeholder="Categoría..."
            size="md"
          />

          {/* Search */}
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Buscar producto..."
            size="md"
          />
        </SimpleGrid>

        {/* Filter Summary and Clear */}
        <HStack justify="space-between" flexWrap="wrap">
          <Text fontSize="sm" color="gray.500">
            {shouldShowResults
              ? `${filteredProducts.length} productos encontrados`
              : 'Aplica filtros para ver productos'}
            {selectedUps !== '' && ` en UPS ${selectedUps}`}
            {selectedCategory && ` - ${getCategoryLabel(selectedCategory)}`}
          </Text>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Icon as={FiFilter} />}
              onClick={handleClearFilters}
            >
              Limpiar filtros
            </Button>
          )}
        </HStack>

        {/* Product Grid */}
        {!shouldShowResults ? (
          <Box py={6} textAlign="center" bg="gray.50" borderRadius="lg">
            <Text color="gray.500">
              Selecciona un UPS o usa la busqueda para mostrar productos
            </Text>
          </Box>
        ) : filteredProducts.length === 0 ? (
          <Box py={8} textAlign="center">
            <Text color="gray.500">
              {hasFilters
                ? selectedUps === 0
                  ? 'UPS 0 no tiene productos registrados. Use "Agregar sin registrar" abajo.'
                  : 'No se encontraron productos con los filtros seleccionados'
                : 'Seleccione un UPS para ver los productos disponibles'}
            </Text>
          </Box>
        ) : (
          <>
            <Box maxH={{ base: '380px', md: '430px' }} overflowY="auto" pr={1}>
              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                {paginatedProducts.map((product) => (
                  <SelectableProductCard
                    key={product.id}
                    product={product}
                    onSelect={onSelectProduct}
                    onAddMultiple={onAddMultiple}
                  />
                ))}
              </SimpleGrid>
            </Box>

            {/* Pagination */}
            {totalPages > 1 && (
              <Flex justify="center" align="center" gap={4} pt={4}>
                <ButtonGroup size="sm" isAttached variant="outline">
                  <Button
                    leftIcon={<Icon as={FiChevronLeft} />}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    isDisabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    rightIcon={<Icon as={FiChevronRight} />}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    isDisabled={currentPage === totalPages}
                  >
                    Siguiente
                  </Button>
                </ButtonGroup>

                <Text fontSize="sm" color="gray.600">
                  Página {currentPage} de {totalPages}
                </Text>
              </Flex>
            )}
          </>
        )}
      </VStack>
    </Box>
  );
}
