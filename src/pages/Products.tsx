import { useState, useMemo, useEffect, Fragment } from "react";
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
  FiDollarSign,
  FiPackage,
  FiShoppingBag,
} from "react-icons/fi";
import { SearchInput, EmptyState, ConfirmDialog, AutocompleteSelect } from "../components/common";
import { ProductForm, SellProductModal, SoldProductDetails } from "../components/products";
import type { SaleData } from "../components/products/SellProductModal";
import { useProductStore } from "../store/productStore";
import { useTransactionStore, createSaleTransaction } from "../store/transactionStore";
import { useCustomerStore } from "../store/customerStore";
import { Product, CategoryCode, ProductStatus } from "../types";
import { CATEGORY_OPTIONS, getCategoryLabel } from "../constants/categories";
import { UPS_BATCH_OPTIONS } from "../constants/colors";
import { formatCurrency, formatDate } from "../utils/formatters";
import { es } from "../i18n/es";

// Mobile Product Card Component
function ProductCard({
  product,
  onEdit,
  onDelete,
  onSell,
  viewMode,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onSell: () => void;
  viewMode: 'available' | 'sold';
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
            {product.status === "available" && (
              <MenuItem icon={<Icon as={FiDollarSign} />} onClick={onSell}>
                Vender
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

      {viewMode === 'sold' && (
        <Box mb={2} p={2} bg="blue.50" borderRadius="md">
          <Text fontSize="xs" color="blue.700">
            Vendido a: {customer?.name || es.customers.walkIn}
          </Text>
          {product.soldAt && (
            <Text fontSize="xs" color="gray.500">
              Fecha: {formatDate(product.soldAt)}
            </Text>
          )}
        </Box>
      )}

      <Flex justify="space-between" align="center" mt={2}>
        <VStack align="start" spacing={0}>
          <Text fontSize="xs" color="gray.500">
            Cantidad
          </Text>
          <HStack>
            <Text
              fontWeight="bold"
              color={
                product.quantity <= product.lowStockThreshold && product.status === 'available'
                  ? "orange.500"
                  : "inherit"
              }
            >
              {product.quantity}
            </Text>
            {product.quantity <= product.lowStockThreshold && product.status === 'available' && (
              <Badge colorScheme="orange" fontSize="xs">
                {es.products.lowStock}
              </Badge>
            )}
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
                : "orange"
          }
        >
          {product.status === "available"
            ? es.products.available
            : product.status === "sold"
              ? es.products.sold
              : es.products.reserved}
        </Badge>
      </Flex>

      {/* Quick Sell Button - Mobile */}
      {product.status === "available" && viewMode === 'available' && (
        <Button
          mt={3}
          size="sm"
          colorScheme="green"
          leftIcon={<Icon as={FiDollarSign} />}
          onClick={onSell}
          w="full"
        >
          Vender
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

  const { addTransaction } = useTransactionStore();
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

  const {
    isOpen: isSellOpen,
    onOpen: onSellOpen,
    onClose: onSellClose,
  } = useDisclosure();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToSell, setProductToSell] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'available' | 'sold'>('available');
  const ITEMS_PER_PAGE = 50;

  // Check if we should open form from URL params
  useState(() => {
    if (searchParams.get("action") === "new") {
      onFormOpen();
    }
  });

  // Set default filter to latest UPS drop on mount
  useEffect(() => {
    if (products.length > 0 && !filters.upsBatch) {
      const latestDrop = Math.max(...products.map(p => p.upsBatch || 0));
      if (latestDrop > 0) {
        setFilters({ upsBatch: latestDrop });
      }
    }
  }, []); // Run only on mount

  // Get all filtered products
  const allFilteredProducts = useMemo(
    () => getFilteredProducts(),
    [products, filters],
  );

  // Filter by view mode (available or sold)
  const filteredProducts = useMemo(() => {
    if (viewMode === 'available') {
      return allFilteredProducts.filter(p => p.status === 'available');
    }
    return allFilteredProducts.filter(p => p.status === 'sold');
  }, [allFilteredProducts, viewMode]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Reset page when filters or viewMode change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, viewMode]);

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

  const handleSellClick = (product: Product) => {
    setProductToSell(product);
    onSellOpen();
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

  const handleConfirmSale = (saleData: SaleData) => {
    if (!productToSell) return;

    setIsLoading(true);
    try {
      // Create transaction
      const transaction = createSaleTransaction(
        { id: saleData.customerId, name: saleData.customerName },
        [{
          productId: productToSell.id,
          productName: productToSell.name,
          quantity: saleData.quantity,
          unitPrice: productToSell.unitPrice,
          totalPrice: saleData.quantity * productToSell.unitPrice,
          category: productToSell.category,
          brand: productToSell.brand,
          color: productToSell.color,
          size: productToSell.size,
        }],
        {
          method: saleData.paymentMethod,
          cash: saleData.cashAmount,
          transfer: saleData.transferAmount,
          card: saleData.cardAmount,
        },
        {
          notes: saleData.notes,
          isInstallment: saleData.paymentMethod === 'credit',
        }
      );

      addTransaction(transaction);

      // Update product quantity and status
      const newQuantity = productToSell.quantity - saleData.quantity;
      const productUpdate: Partial<Product> = {
        quantity: newQuantity,
      };

      // If quantity becomes 0, mark as sold
      if (newQuantity === 0) {
        productUpdate.status = 'sold';
        productUpdate.soldTo = saleData.customerId;
        productUpdate.soldAt = new Date().toISOString();
      }

      updateProduct(productToSell.id, productUpdate);

      // If credit sale, add to customer balance
      const totalSale = saleData.quantity * productToSell.unitPrice;
      const paidAmount = saleData.cashAmount + saleData.transferAmount + saleData.cardAmount;
      const unpaidAmount = totalSale - paidAmount;

      if (unpaidAmount > 0 && saleData.customerId) {
        addPurchase(saleData.customerId, unpaidAmount);
      }

      toast({
        title: es.sales.saleCompleted,
        description: `${saleData.quantity}x ${productToSell.name} - ${formatCurrency(totalSale)}`,
        status: "success",
        duration: 4000,
        isClosable: true,
      });

      onSellClose();
      setProductToSell(null);
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
      promotional: { color: "purple", label: "Promoción" },
      donated: { color: "blue", label: "Donado" },
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
        index={viewMode === 'available' ? 0 : 1}
        onChange={(index) => setViewMode(index === 0 ? 'available' : 'sold')}
        colorScheme="brand"
        variant="enclosed"
      >
        <TabList>
          <Tab>
            <HStack spacing={2}>
              <Icon as={FiPackage} />
              <Text>Disponibles</Text>
              <Badge colorScheme="green" ml={1}>
                {allFilteredProducts.filter(p => p.status === 'available').length}
              </Badge>
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing={2}>
              <Icon as={FiShoppingBag} />
              <Text>Vendidos</Text>
              <Badge colorScheme="gray" ml={1}>
                {allFilteredProducts.filter(p => p.status === 'sold').length}
              </Badge>
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* Both tabs share the same content, just filtered differently */}
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

      {/* Sell Product Modal */}
      <SellProductModal
        isOpen={isSellOpen}
        onClose={onSellClose}
        product={productToSell}
        onConfirm={handleConfirmSale}
        isLoading={isLoading}
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
                onChange={(val) => setFilters({ category: val as CategoryCode | "" })}
                placeholder="Categoría"
                size="md"
              />

              <AutocompleteSelect
                options={UPS_BATCH_OPTIONS}
                value={filters.upsBatch || ""}
                onChange={(val) => setFilters({ upsBatch: val ? Number(val) : "" })}
                placeholder="UPS"
                size="md"
              />

              {viewMode === 'available' && (
                <AutocompleteSelect
                  options={[
                    { value: "available", label: es.products.available },
                    { value: "reserved", label: es.products.reserved },
                  ]}
                  value={filters.status}
                  onChange={(val) => setFilters({ status: val as ProductStatus | "" })}
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
                  onClick={clearFilters}
                  leftIcon={<Icon as={FiFilter} />}
                  size={{ base: "sm", md: "md" }}
                >
                  Limpiar
                </Button>
              )}
            </SimpleGrid>

            <Text fontSize="sm" color="gray.500">
              {filteredProducts.length} productos encontrados
            </Text>
          </VStack>
        </Box>

        {/* Products - Cards on Mobile, Table on Desktop */}
        {filteredProducts.length === 0 ? (
          <Box bg="white" borderRadius="xl" boxShadow="sm">
            <EmptyState
              title={viewMode === 'available' ? es.products.noProducts : "No hay productos vendidos"}
              message={viewMode === 'available' ? "Agregue productos para comenzar" : "Los productos vendidos aparecerán aquí"}
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
                onSell={() => handleSellClick(product)}
                viewMode={viewMode}
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
                        <Text
                          fontWeight="bold"
                          color={
                            product.quantity <= product.lowStockThreshold && product.status === 'available'
                              ? "orange.500"
                              : "inherit"
                          }
                        >
                          {product.quantity}
                        </Text>
                        {product.quantity <= product.lowStockThreshold && product.status === 'available' && (
                          <Badge colorScheme="orange" size="sm">
                            {es.products.lowStock}
                          </Badge>
                        )}
                      </Td>
                      <Td isNumeric fontWeight="bold">
                        {formatCurrency(product.unitPrice)}
                      </Td>
                      {viewMode === 'sold' && (
                        <Td>
                          <Text fontSize="sm">{getCustomerName(product)}</Text>
                        </Td>
                      )}
                      <Td>{getStatusBadge(product.status)}</Td>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <HStack spacing={1}>
                          {/* Quick Sell Button */}
                          {product.status === "available" && (
                            <IconButton
                              icon={<Icon as={FiDollarSign} />}
                              aria-label="Vender"
                              size="sm"
                              colorScheme="green"
                              variant="ghost"
                              onClick={() => handleSellClick(product)}
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
                              {product.status === "available" && (
                                <MenuItem
                                  icon={<Icon as={FiDollarSign} />}
                                  onClick={() => handleSellClick(product)}
                                >
                                  Vender
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
                        <Td colSpan={viewMode === 'sold' ? 10 : 9} py={4}>
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
