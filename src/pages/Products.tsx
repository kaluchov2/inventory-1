import { useState, useMemo, useEffect, useCallback, useRef, Fragment, startTransition } from "react";
import {
  Box,
  Heading,
  HStack,
  VStack,
  Button,
  Icon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  useDisclosure,
  useToast,
  Text,
  Flex,
  SimpleGrid,
  useBreakpointValue,
  ButtonGroup,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Skeleton,
  SkeletonText,
  Switch,
  FormControl,
  FormLabel,
  Spinner,
  Center,
} from "@chakra-ui/react";
import { useSearchParams } from "react-router-dom";
import {
  FiPlus,
  FiMoreVertical,
  FiEdit2,
  FiTrash2,
  FiFilter,
  FiChevronDown,
  FiChevronUp,
  FiPackage,
  FiShoppingBag,
  FiAlertCircle,
  FiCheckCircle,
} from "react-icons/fi";
import { SearchInput, EmptyState, ConfirmDialog, AutocompleteSelect } from "../components/common";
import { ProductForm, SoldProductDetails, ResolveReviewModal } from "../components/products";
import type { ResolveData } from "../components/products/ResolveReviewModal";
import { Product, CategoryCode, ProductStatus, Transaction } from "../types";
import { CATEGORY_OPTIONS, getCategoryLabel } from "../constants/categories";
import { UPS_BATCH_OPTIONS } from "../constants/colors";
import { formatCurrency, formatDate } from "../utils/formatters";
import { es } from "../i18n/es";
import { useProductStore } from "../store/productStore";
import { useTransactionStore, createSaleTransaction } from "../store/transactionStore";
import { useCustomerStore } from "../store/customerStore";
import { getReviewQty, deriveStatus } from "../utils/productHelpers";

// Helper function to get payment status for a product
function getPaymentStatusForProduct(
  productId: string,
  transactions: Transaction[],
  getEffectivePendingMap?: (customerId: string) => Map<string, number>
): { status: 'paid' | 'pending' | 'unknown'; amount: number } {
  const relatedTransaction = transactions.find(
    (t) =>
      t.type === 'sale' &&
      t.items.some((item) => item.productId === productId)
  );

  if (!relatedTransaction) return { status: 'unknown', amount: 0 };

  const originalPaid =
    relatedTransaction.cashAmount +
    relatedTransaction.transferAmount +
    relatedTransaction.cardAmount;

  if (originalPaid >= relatedTransaction.total) {
    return { status: 'paid', amount: 0 };
  }

  // Account for installment payments
  if (getEffectivePendingMap && relatedTransaction.customerId) {
    const pendingMap = getEffectivePendingMap(relatedTransaction.customerId);
    const effectivePending = pendingMap.get(relatedTransaction.id);
    if (effectivePending !== undefined) {
      if (effectivePending <= 0.01) return { status: 'paid', amount: 0 };
      return { status: 'pending', amount: effectivePending };
    }
  }

  return { status: 'pending', amount: relatedTransaction.total - originalPaid };
}

// Mobile Product Card Component
function ProductCard({
  product,
  onEdit,
  onDelete,
  onResolve,
  viewMode,
  paymentStatus,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onResolve?: () => void;
  viewMode: 'available' | 'sold' | 'review' | 'other';
  paymentStatus?: { status: 'paid' | 'pending' | 'unknown'; amount: number };
}) {
  const { customers } = useCustomerStore();
  const customer = product.soldTo ? customers.find(c => c.id === product.soldTo) : null;

  return (
    <Box
      bg="white"
      p={4}
      borderRadius="lg"
      boxShadow="sm"
      border="1px"
      borderColor="gray.100"
      opacity={product.status === "sold" && viewMode === 'available' ? 0.6 : 1}
    >
      <Flex justify="space-between" align="start" mb={2}>
        <VStack align="start" spacing={1} flex={1}>
          <HStack spacing={2} flexWrap="wrap">
            <Badge colorScheme="blue" fontSize="xs">
              UPS {product.upsBatch}
            </Badge>
            <Badge colorScheme="purple" fontSize="xs">
              {getCategoryLabel(product.category)}
            </Badge>
          </HStack>
          <Text fontWeight="bold" fontSize="md" noOfLines={2}>
            {product.name}
          </Text>
        </VStack>
        <Menu>
          <MenuButton
            as={IconButton}
            icon={<Icon as={FiMoreVertical} />}
            variant="ghost"
            size="sm"
            aria-label="Acciones"
          />
          <MenuList>
            <MenuItem icon={<Icon as={FiEdit2} />} onClick={onEdit}>
              {es.actions.edit}
            </MenuItem>
            {getReviewQty(product) > 0 && onResolve && (
              <MenuItem icon={<Icon as={FiCheckCircle} />} onClick={onResolve}>
                Resolver
              </MenuItem>
            )}
            <MenuItem
              icon={<Icon as={FiTrash2} />}
              color="red.500"
              onClick={onDelete}
            >
              {es.actions.delete}
            </MenuItem>
          </MenuList>
        </Menu>
      </Flex>

      {(product.brand || product.color || product.size) && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {[product.brand, product.color, product.size]
            .filter(Boolean)
            .join(" • ")}
        </Text>
      )}

      {product.notes && (
        <Box mb={2} p={2} bg="gray.50" borderRadius="md">
          <Text fontSize="xs" color="gray.600" fontWeight="semibold" mb={1}>Notas:</Text>
          <Text fontSize="sm" color="gray.700" noOfLines={3}>{product.notes}</Text>
        </Box>
      )}

      {viewMode === 'sold' && (
        <Box mb={2} p={2} bg="blue.50" borderRadius="md">
          <Flex justify="space-between" align="start">
            <Box>
              <Text fontSize="xs" color="blue.700">
                Vendido a: {customer?.name || es.customers.walkIn}
              </Text>
              {product.soldAt && (
                <Text fontSize="xs" color="gray.500">
                  Fecha: {formatDate(product.soldAt)}
                </Text>
              )}
            </Box>
            {paymentStatus && (
              <Badge
                colorScheme={paymentStatus.status === 'paid' ? 'green' : 'orange'}
                fontSize="xs"
              >
                {paymentStatus.status === 'paid'
                  ? es.products.paid
                  : `${es.products.owes} ${formatCurrency(paymentStatus.amount)}`}
              </Badge>
            )}
          </Flex>
        </Box>
      )}

      <Flex justify="space-between" align="center" mt={2}>
        <VStack align="start" spacing={0}>
          <Text fontSize="xs" color="gray.500">
            Cantidad
          </Text>
          <HStack>
            <Text fontWeight="bold">
              {viewMode === 'review' ? getReviewQty(product) : viewMode === 'available' ? product.availableQty : viewMode === 'sold' ? product.soldQty : (product.donatedQty + product.lostQty + product.expiredQty)}
            </Text>
          </HStack>
        </VStack>
        <VStack align="end" spacing={0}>
          <Text fontSize="xs" color="gray.500">
            Precio
          </Text>
          <Text fontWeight="bold" color="green.600">
            {formatCurrency(product.unitPrice)}
          </Text>
        </VStack>
        <Badge
          colorScheme={
            product.status === "available"
              ? "green"
              : product.status === "sold"
                ? "gray"
                : product.status === "review"
                  ? "yellow"
                  : product.status === "donated"
                    ? "blue"
                    : product.status === "promotional"
                      ? "purple"
                      : product.status === "expired"
                        ? "red"
                        : product.status === "lost"
                          ? "pink"
                          : "orange"
          }
        >
          {product.status === "available"
            ? es.products.available
            : product.status === "sold"
              ? es.products.sold
              : product.status === "review"
                ? "Revisar"
                : product.status === "donated"
                  ? "Donado"
                  : product.status === "promotional"
                    ? "Promocion"
                    : product.status === "expired"
                      ? "Caducado"
                      : product.status === "lost"
                        ? "Perdido"
                        : es.products.reserved}
        </Badge>
      </Flex>

      {/* Resolve Button - Mobile (Review tab) */}
      {getReviewQty(product) > 0 && viewMode === 'review' && onResolve && (
        <Button
          mt={3}
          size="sm"
          colorScheme="yellow"
          leftIcon={<Icon as={FiCheckCircle} />}
          onClick={onResolve}
          w="full"
        >
          Resolver
        </Button>
      )}
    </Box>
  );
}

export function Products() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const {
    products,
    filters,
    setFilters,
    clearFilters,
    addProduct,
    updateProduct,
    deleteProduct,
    getFilteredProducts,
  } = useProductStore();

  const { addTransaction, transactions, getEffectivePendingMap } = useTransactionStore();
  const { addPurchase } = useCustomerStore();
  const { customers } = useCustomerStore();

  const {
    isOpen: isFormOpen,
    onOpen: onFormOpen,
    onClose: onFormClose,
  } = useDisclosure();

  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'available' | 'sold' | 'review' | 'other'>('available');
  const [productToResolve, setProductToResolve] = useState<Product | null>(null);
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [isShowAllLoading, setIsShowAllLoading] = useState(false);
  const tabLoadingTimer = useRef<ReturnType<typeof setTimeout>>();
  const ITEMS_PER_PAGE = 50;

  // Disclosure for resolve modal
  const {
    isOpen: isResolveOpen,
    onOpen: onResolveOpen,
    onClose: onResolveClose,
  } = useDisclosure();

  // Check if we should open form or switch tab from URL params
  useState(() => {
    if (searchParams.get("action") === "new") {
      onFormOpen();
    }
    const tab = searchParams.get("tab");
    if (tab === 'review') setViewMode('review');
    else if (tab === 'sold') setViewMode('sold');
    else if (tab === 'other') setViewMode('other');
  });

  // Whether products should be displayed (either UPS selected or showAll toggled)
  const hasSelection = !!filters.upsBatch || showAll;

  // Get all filtered products — only compute when there's a selection
  const allFilteredProducts = useMemo(
    () => hasSelection ? getFilteredProducts() : [],
    [products, filters, hasSelection],
  );

  // Filter by view mode using qty columns (a product CAN appear in multiple tabs)
  const filteredProducts = useMemo(() => {
    if (viewMode === 'available') {
      return allFilteredProducts.filter(p => p.availableQty > 0);
    }
    if (viewMode === 'sold') {
      return allFilteredProducts.filter(p => p.soldQty > 0);
    }
    if (viewMode === 'other') {
      return allFilteredProducts.filter(p => (p.donatedQty + p.lostQty + p.expiredQty) > 0);
    }
    return allFilteredProducts.filter(p => getReviewQty(p) > 0);
  }, [allFilteredProducts, viewMode]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Memoize tab counts using qty columns
  const tabCounts = useMemo(() => ({
    available: allFilteredProducts.filter(p => p.availableQty > 0).length,
    sold: allFilteredProducts.filter(p => p.soldQty > 0).length,
    review: allFilteredProducts.filter(p => getReviewQty(p) > 0).length,
    other: allFilteredProducts.filter(p => (p.donatedQty + p.lostQty + p.expiredQty) > 0).length,
  }), [allFilteredProducts]);

  // Reset page when filters or viewMode change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, viewMode]);

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(tabLoadingTimer.current), []);

  // Brief loading state for tab/filter transitions so UI feels responsive
  const triggerTabLoading = useCallback(() => {
    clearTimeout(tabLoadingTimer.current);
    setIsTabLoading(true);
    tabLoadingTimer.current = setTimeout(() => setIsTabLoading(false), 150);
  }, []);

  // Wrapped setViewMode with loading transition
  const handleViewModeChange = useCallback((mode: 'available' | 'sold' | 'review' | 'other') => {
    triggerTabLoading();
    setViewMode(mode);
  }, [triggerTabLoading]);

  // Wrapped setFilters with loading transition
  const handleSetFilters = useCallback((newFilters: Parameters<typeof setFilters>[0]) => {
    triggerTabLoading();
    // If user picks a UPS filter, turn off showAll
    if ('upsBatch' in newFilters && newFilters.upsBatch) {
      setShowAll(false);
    }
    setFilters(newFilters);
  }, [triggerTabLoading, setFilters]);

  // Toggle "show all" with loading feedback
  const handleShowAllToggle = useCallback(() => {
    if (showAll) {
      // Turning off — go back to no-selection state
      setShowAll(false);
      setFilters({ upsBatch: '' });
      return;
    }
    // Turning on — show spinner, defer heavy render
    setIsShowAllLoading(true);
    setFilters({ upsBatch: '' });
    // Use setTimeout to let the spinner paint before heavy work
    setTimeout(() => {
      startTransition(() => {
        setShowAll(true);
        setIsShowAllLoading(false);
      });
    }, 50);
  }, [showAll, setFilters]);

  const handleAddProduct = () => {
    setSelectedProduct(null);
    onFormOpen();
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    onFormOpen();
  };

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
    onDeleteOpen();
  };

  const handleResolveClick = (product: Product) => {
    setProductToResolve(product);
    onResolveOpen();
  };

  const handleFormSubmit = async (data: any, addAnother?: boolean) => {
    setIsLoading(true);
    try {
      if (selectedProduct) {
        updateProduct(selectedProduct.id, data);
        toast({
          title: es.success.productUpdated,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        addProduct({
          ...data,
          status: "available",
          availableQty: data.quantity,
        });
        toast({
          title: es.success.productAdded,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
      // Only close if not adding another
      if (!addAnother) {
        onFormClose();
      }
    } catch (error) {
      toast({
        title: es.errors.saveError,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = () => {
    if (productToDelete) {
      deleteProduct(productToDelete.id);
      toast({
        title: es.success.productDeleted,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      onDeleteClose();
      setProductToDelete(null);
    }
  };

  // Double-click guard ref for resolve
  const isResolvingRef = useRef(false);

  const handleConfirmResolve = (resolveData: ResolveData) => {
    if (!productToResolve || isResolvingRef.current) return;
    isResolvingRef.current = true;
    const product = productToResolve;
    onResolveClose();
    setProductToResolve(null);

    try {
      const qty = resolveData.quantity;
      const updates: Partial<Product> = {};

      // Increment the target qty field on the SAME product — no split
      switch (resolveData.resolution) {
        case 'available': updates.availableQty = product.availableQty + qty; break;
        case 'sold': updates.soldQty = product.soldQty + qty; break;
        case 'donated': updates.donatedQty = product.donatedQty + qty; break;
        case 'lost': updates.lostQty = product.lostQty + qty; break;
        case 'expired': updates.expiredQty = product.expiredQty + qty; break;
      }

      // Handle sold resolution — create transaction + payment
      if (resolveData.resolution === 'sold') {
        const effectiveUnitPrice = resolveData.salePrice ?? product.unitPrice;
        const effectiveTotalPrice = qty * effectiveUnitPrice;

        const transaction = createSaleTransaction(
          { id: resolveData.customerId || '', name: resolveData.customerName || es.customers.walkIn },
          [{
            productId: product.id,
            productName: product.name,
            quantity: qty,
            unitPrice: effectiveUnitPrice,
            totalPrice: effectiveTotalPrice,
            category: product.category,
            brand: product.brand,
            color: product.color,
            size: product.size,
          }],
          {
            method: resolveData.paymentMethod || 'cash',
            cash: resolveData.cashAmount || 0,
            transfer: resolveData.transferAmount || 0,
            card: resolveData.cardAmount || 0,
          },
          {
            notes: resolveData.notes,
            isInstallment: resolveData.paymentMethod === 'credit',
          }
        );

        addTransaction(transaction);

        updates.soldTo = resolveData.customerId;
        updates.soldAt = new Date().toISOString();

        if (resolveData.discount && resolveData.discount > 0) {
          updates.originalPrice = product.unitPrice;
          updates.unitPrice = effectiveUnitPrice;
        }

        // Handle credit balance
        const paidAmount = (resolveData.cashAmount || 0) + (resolveData.transferAmount || 0) + (resolveData.cardAmount || 0);
        const unpaidAmount = effectiveTotalPrice - paidAmount;
        if (unpaidAmount > 0 && resolveData.customerId) {
          addPurchase(resolveData.customerId, unpaidAmount);
        }

        toast({
          title: "Producto marcado como vendido",
          description: `${qty}x ${product.name} - ${formatCurrency(effectiveTotalPrice)}`,
          status: "success",
          duration: 4000,
          isClosable: true,
        });
      } else {
        const labelMap: Record<string, string> = {
          available: 'disponible',
          donated: 'donado',
          lost: 'perdido',
          expired: 'caducado',
        };

        toast({
          title: `Producto marcado como ${labelMap[resolveData.resolution]}`,
          description: `${qty}x ${product.name}`,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }

      // Update notes
      if (resolveData.notes) {
        updates.notes = `${product.notes || ''}\nResolucion: ${resolveData.notes}`.trim();
      }

      // Derive status for backward compat
      const updatedProduct = { ...product, ...updates };
      updates.status = deriveStatus(updatedProduct as Product);

      updateProduct(product.id, updates);
    } finally {
      isResolvingRef.current = false;
    }
  };

  const toggleExpandRow = (productId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: ProductStatus) => {
    const config: Record<ProductStatus, { color: string; label: string }> = {
      available: { color: "green", label: es.products.available },
      sold: { color: "gray", label: es.products.sold },
      reserved: { color: "orange", label: es.products.reserved },
      promotional: { color: "purple", label: "Promocion" },
      donated: { color: "blue", label: "Donado" },
      review: { color: "yellow", label: "Revisar" },
      expired: { color: "red", label: "Caducado" },
      lost: { color: "pink", label: "Perdido" },
    };
    return (
      <Badge colorScheme={config[status].color}>{config[status].label}</Badge>
    );
  };

  // Get customer name for sold products
  const getCustomerName = (product: Product) => {
    if (!product.soldTo) return es.customers.walkIn;
    const customer = customers.find(c => c.id === product.soldTo);
    return customer?.name || es.customers.walkIn;
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Heading size={{ base: "lg", md: "xl" }}>{es.products.title}</Heading>
        <Button
          leftIcon={<Icon as={FiPlus} />}
          colorScheme="brand"
          size={{ base: "md", md: "lg" }}
          onClick={handleAddProduct}
        >
          {es.products.addProduct}
        </Button>
      </Flex>

      {/* View Mode Tabs */}
      <Tabs
        index={viewMode === 'available' ? 0 : viewMode === 'sold' ? 1 : viewMode === 'review' ? 2 : 3}
        onChange={(index) => handleViewModeChange(index === 0 ? 'available' : index === 1 ? 'sold' : index === 2 ? 'review' : 'other')}
        colorScheme="brand"
        variant="enclosed"
      >
        <TabList>
          <Tab>
            <HStack spacing={2}>
              <Icon as={FiPackage} />
              <Text>Disponibles</Text>
              {hasSelection && <Badge colorScheme="green" ml={1}>{tabCounts.available}</Badge>}
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing={2}>
              <Icon as={FiShoppingBag} />
              <Text>Vendidos</Text>
              {hasSelection && <Badge colorScheme="gray" ml={1}>{tabCounts.sold}</Badge>}
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing={2}>
              <Icon as={FiAlertCircle} />
              <Text>Revisar</Text>
              {hasSelection && <Badge colorScheme="yellow" ml={1}>{tabCounts.review}</Badge>}
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing={2}>
              <Icon as={FiPackage} />
              <Text>Otros</Text>
              {hasSelection && <Badge colorScheme="teal" ml={1}>{tabCounts.other}</Badge>}
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* All tabs share the same content, just filtered differently */}
          <TabPanel px={0}>
            {renderProductContent()}
          </TabPanel>
          <TabPanel px={0}>
            {renderProductContent()}
          </TabPanel>
          <TabPanel px={0}>
            {renderProductContent()}
          </TabPanel>
          <TabPanel px={0}>
            {renderProductContent()}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Product Form Modal */}
      <ProductForm
        isOpen={isFormOpen}
        onClose={onFormClose}
        onSubmit={handleFormSubmit}
        product={selectedProduct}
        isLoading={isLoading}
        initialUpsBatch={filters.upsBatch ? Number(filters.upsBatch) : undefined}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={onDeleteClose}
        onConfirm={handleConfirmDelete}
        title={es.actions.delete}
        message={es.products.deleteConfirm}
        confirmText={es.actions.delete}
      />

      {/* Resolve Review Modal */}
      <ResolveReviewModal
        isOpen={isResolveOpen}
        onClose={onResolveClose}
        product={productToResolve}
        onConfirm={handleConfirmResolve}
        isLoading={isLoading}
      />
    </VStack>
  );

  function renderProductContent() {
    return (
      <>
        {/* Filters */}
        <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm" mb={4}>
          <VStack spacing={3} align="stretch">
            {/* Search - Full Width */}
            <SearchInput
              value={filters.search}
              onChange={(value) => setFilters({ search: value })}
              placeholder={es.products.searchPlaceholder}
            />

            {/* Filter Dropdowns */}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
              <AutocompleteSelect
                options={CATEGORY_OPTIONS}
                value={filters.category}
                onChange={(val) => handleSetFilters({ category: val as CategoryCode | "" })}
                placeholder="Categoría"
                size="md"
              />

              <AutocompleteSelect
                options={UPS_BATCH_OPTIONS}
                value={filters.upsBatch || ""}
                onChange={(val) => handleSetFilters({ upsBatch: val ? Number(val) : "" })}
                placeholder="Seleccionar UPS"
                size="md"
              />

              {viewMode === 'available' && (
                <AutocompleteSelect
                  options={[
                    { value: "available", label: es.products.available },
                    { value: "reserved", label: es.products.reserved },
                  ]}
                  value={filters.status}
                  onChange={(val) => handleSetFilters({ status: val as ProductStatus | "" })}
                  placeholder="Estado"
                  size="md"
                />
              )}
              {viewMode === 'other' && (
                <AutocompleteSelect
                  options={[
                    { value: "donated", label: "Donado" },
                    { value: "expired", label: "Caducado" },
                    { value: "lost", label: "Perdido" },
                  ]}
                  value={filters.status}
                  onChange={(val) => handleSetFilters({ status: val as ProductStatus | "" })}
                  placeholder="Estado"
                  size="md"
                />
              )}

              {(filters.search ||
                filters.category ||
                filters.upsBatch ||
                filters.status) && (
                <Button
                  variant="outline"
                  onClick={() => { clearFilters(); setShowAll(false); }}
                  leftIcon={<Icon as={FiFilter} />}
                  size={{ base: "sm", md: "md" }}
                >
                  Limpiar
                </Button>
              )}
            </SimpleGrid>

            {/* Show All toggle */}
            <Flex justify="space-between" align="center">
              <Text fontSize="sm" color="gray.500">
                {hasSelection ? `${filteredProducts.length} productos encontrados` : `${products.length} productos en total`}
              </Text>
              <FormControl display="flex" alignItems="center" w="auto">
                <FormLabel htmlFor="show-all" mb={0} fontSize="sm" color="gray.600" mr={2}>
                  Mostrar todos
                </FormLabel>
                <Switch
                  id="show-all"
                  size="md"
                  colorScheme="brand"
                  isChecked={showAll}
                  onChange={handleShowAllToggle}
                />
              </FormControl>
            </Flex>
          </VStack>
        </Box>

        {/* Products - Cards on Mobile, Table on Desktop */}
        {isShowAllLoading ? (
          /* Loading spinner while "show all" loads */
          <Center py={16}>
            <VStack spacing={4}>
              <Spinner size="xl" color="brand.500" thickness="4px" />
              <Text color="gray.500">Cargando todos los productos...</Text>
            </VStack>
          </Center>
        ) : !hasSelection ? (
          /* Prompt to select UPS */
          <Box bg="white" borderRadius="xl" boxShadow="sm" py={16}>
            <Center>
              <VStack spacing={3}>
                <Icon as={FiPackage} boxSize={10} color="gray.300" />
                <Text fontSize="lg" fontWeight="medium" color="gray.500">
                  Selecciona un UPS para ver productos
                </Text>
                <Text fontSize="sm" color="gray.400">
                  O activa "Mostrar todos" para cargar el inventario completo
                </Text>
              </VStack>
            </Center>
          </Box>
        ) : isTabLoading ? (
          /* Loading skeleton during tab/filter transitions */
          <VStack spacing={3} align="stretch">
            {Array.from({ length: 6 }).map((_, i) => (
              <Box key={i} bg="white" p={4} borderRadius="lg" boxShadow="sm">
                <HStack spacing={3} mb={3}>
                  <Skeleton height="20px" width="60px" borderRadius="md" />
                  <Skeleton height="20px" width="80px" borderRadius="md" />
                </HStack>
                <Skeleton height="18px" width="70%" mb={2} />
                <SkeletonText noOfLines={1} width="40%" />
                <HStack justify="space-between" mt={3}>
                  <Skeleton height="16px" width="50px" />
                  <Skeleton height="16px" width="60px" />
                  <Skeleton height="22px" width="70px" borderRadius="md" />
                </HStack>
              </Box>
            ))}
          </VStack>
        ) : filteredProducts.length === 0 ? (
          <Box bg="white" borderRadius="xl" boxShadow="sm">
            <EmptyState
              title={viewMode === 'available' ? es.products.noProducts : viewMode === 'sold' ? "No hay productos vendidos" : viewMode === 'review' ? "No hay productos por revisar" : "No hay productos en esta categoría"}
              message={viewMode === 'available' ? "Agregue productos para comenzar" : viewMode === 'sold' ? "Los productos vendidos aparecerán aquí" : viewMode === 'review' ? "Los productos por revisar aparecerán aquí" : "Los productos donados, caducados o perdidos aparecerán aquí"}
              actionLabel={viewMode === 'available' ? es.products.addProduct : undefined}
              onAction={viewMode === 'available' ? handleAddProduct : undefined}
            />
          </Box>
        ) : isMobile ? (
          /* Mobile Card View */
          <VStack spacing={3} align="stretch">
            {paginatedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => handleEditProduct(product)}
                onDelete={() => handleDeleteClick(product)}
                onResolve={() => handleResolveClick(product)}
                viewMode={viewMode}
                paymentStatus={viewMode === 'sold' ? getPaymentStatusForProduct(product.id, transactions, getEffectivePendingMap) : undefined}
              />
            ))}
          </VStack>
        ) : (
          /* Desktop Table View */
          <Box bg="white" borderRadius="xl" boxShadow="sm" overflowX="auto">
            <Table>
              <Thead bg="gray.50">
                <Tr>
                  <Th w="40px"></Th>
                  <Th>UPS</Th>
                  <Th>{es.products.productName}</Th>
                  <Th>{es.products.category}</Th>
                  <Th>{es.products.brand}</Th>
                  <Th isNumeric>{es.products.quantity}</Th>
                  <Th isNumeric>{es.products.unitPrice}</Th>
                  {viewMode === 'sold' && <Th>Cliente</Th>}
                  {viewMode === 'sold' && <Th>Pago</Th>}
                  <Th>{es.products.status}</Th>
                  <Th w="120px">Acciones</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paginatedProducts.map((product) => (
                  <Fragment key={product.id}>
                    <Tr
                      _hover={{ bg: "gray.50" }}
                      opacity={product.status === "sold" && viewMode === 'available' ? 0.6 : 1}
                      cursor="pointer"
                      onClick={() => toggleExpandRow(product.id)}
                    >
                      <Td>
                        <Icon
                          as={expandedRows.has(product.id) ? FiChevronUp : FiChevronDown}
                          color="gray.500"
                        />
                      </Td>
                      <Td>
                        <Badge colorScheme="blue">UPS {product.upsBatch}</Badge>
                      </Td>
                      <Td>
                        <VStack align="start" spacing={0}>
                          <Text fontWeight="medium" noOfLines={1}>
                            {product.name}
                          </Text>
                          {(product.color || product.size) && (
                            <Text fontSize="sm" color="gray.500">
                              {[product.color, product.size]
                                .filter(Boolean)
                                .join(" / ")}
                            </Text>
                          )}
                        </VStack>
                      </Td>
                      <Td>
                        <Badge colorScheme="purple">
                          {getCategoryLabel(product.category)}
                        </Badge>
                      </Td>
                      <Td>{product.brand || "-"}</Td>
                      <Td isNumeric>
                        <Text fontWeight="bold">
                          {viewMode === 'review' ? getReviewQty(product) : viewMode === 'available' ? product.availableQty : viewMode === 'sold' ? product.soldQty : (product.donatedQty + product.lostQty + product.expiredQty)}
                        </Text>
                      </Td>
                      <Td isNumeric fontWeight="bold">
                        {formatCurrency(product.unitPrice)}
                      </Td>
                      {viewMode === 'sold' && (
                        <Td>
                          <Text fontSize="sm">{getCustomerName(product)}</Text>
                        </Td>
                      )}
                      {viewMode === 'sold' && (
                        <Td>
                          {(() => {
                            const paymentStatus = getPaymentStatusForProduct(product.id, transactions, getEffectivePendingMap);
                            return (
                              <Badge
                                colorScheme={paymentStatus.status === 'paid' ? 'green' : paymentStatus.status === 'pending' ? 'orange' : 'gray'}
                                fontSize="xs"
                              >
                                {paymentStatus.status === 'paid'
                                  ? es.products.paid
                                  : paymentStatus.status === 'pending'
                                  ? `${es.products.owes} ${formatCurrency(paymentStatus.amount)}`
                                  : '-'}
                              </Badge>
                            );
                          })()}
                        </Td>
                      )}
                      <Td>{getStatusBadge(product.status)}</Td>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <HStack spacing={1}>
                          {/* Quick Resolve Button */}
                          {getReviewQty(product) > 0 && (
                            <IconButton
                              icon={<Icon as={FiCheckCircle} />}
                              aria-label="Resolver"
                              size="sm"
                              colorScheme="yellow"
                              variant="ghost"
                              onClick={() => handleResolveClick(product)}
                            />
                          )}
                          <Menu>
                            <MenuButton
                              as={IconButton}
                              icon={<Icon as={FiMoreVertical} />}
                              variant="ghost"
                              size="sm"
                              aria-label="Acciones"
                            />
                            <MenuList>
                              <MenuItem
                                icon={<Icon as={FiEdit2} />}
                                onClick={() => handleEditProduct(product)}
                              >
                                {es.actions.edit}
                              </MenuItem>
                              {getReviewQty(product) > 0 && (
                                <MenuItem
                                  icon={<Icon as={FiCheckCircle} />}
                                  onClick={() => handleResolveClick(product)}
                                >
                                  Resolver
                                </MenuItem>
                              )}
                              <MenuItem
                                icon={<Icon as={FiTrash2} />}
                                color="red.500"
                                onClick={() => handleDeleteClick(product)}
                              >
                                {es.actions.delete}
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        </HStack>
                      </Td>
                    </Tr>
                    {/* Expanded Row Details */}
                    {expandedRows.has(product.id) && (
                      <Tr key={`${product.id}-details`} bg="gray.50">
                        <Td colSpan={viewMode === 'sold' ? 11 : 9} py={4}>
                          {viewMode === 'sold' ? (
                            <Box px={4}>
                              <SoldProductDetails product={product} />
                            </Box>
                          ) : (
                            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} px={4}>
                              <Box>
                                <Text fontSize="xs" color="gray.500" fontWeight="semibold">SKU</Text>
                                <Text fontSize="sm">{product.sku || "-"}</Text>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color="gray.500" fontWeight="semibold">Código de Barras</Text>
                                <Text fontSize="sm">{product.barcode || "-"}</Text>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color="gray.500" fontWeight="semibold">Precio Original</Text>
                                <Text fontSize="sm">{product.originalPrice ? formatCurrency(product.originalPrice) : "-"}</Text>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color="gray.500" fontWeight="semibold">Descripción</Text>
                                <Text fontSize="sm" noOfLines={2}>{product.description || "-"}</Text>
                              </Box>
                              {product.notes && (
                                <Box gridColumn={{ md: "span 2" }}>
                                  <Text fontSize="xs" color="gray.500" fontWeight="semibold">Notas</Text>
                                  <Text fontSize="sm" whiteSpace="pre-wrap">{product.notes}</Text>
                                </Box>
                              )}
                              <Box>
                                <Text fontSize="xs" color="gray.500" fontWeight="semibold">Creado</Text>
                                <Text fontSize="sm">{new Date(product.createdAt).toLocaleDateString("es-MX")}</Text>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color="gray.500" fontWeight="semibold">Actualizado</Text>
                                <Text fontSize="sm">{new Date(product.updatedAt).toLocaleDateString("es-MX")}</Text>
                              </Box>
                            </SimpleGrid>
                          )}
                        </Td>
                      </Tr>
                    )}
                  </Fragment>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <Flex justify="center" align="center" gap={4} py={4}>
            <ButtonGroup size="sm" isAttached variant="outline">
              <Button
                onClick={() => setCurrentPage(1)}
                isDisabled={currentPage === 1}
              >
                Primera
              </Button>
              <Button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                isDisabled={currentPage === 1}
              >
                Anterior
              </Button>
            </ButtonGroup>

            <Text fontSize="sm" color="gray.600">
              Página {currentPage} de {totalPages}
            </Text>

            <ButtonGroup size="sm" isAttached variant="outline">
              <Button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                isDisabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
              <Button
                onClick={() => setCurrentPage(totalPages)}
                isDisabled={currentPage === totalPages}
              >
                Última
              </Button>
            </ButtonGroup>
          </Flex>
        )}
      </>
    );
  }
}
