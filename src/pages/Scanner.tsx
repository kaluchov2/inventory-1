import { useState, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Icon,
  Tabs,
  TabList,
  Tab,
  Badge,
  Input,
  FormControl,
  FormLabel,
  useDisclosure,
  useToast,
  Alert,
  AlertIcon,
  Flex,
  Divider,
} from '@chakra-ui/react';
import { Scanner as QRScanner } from '@yudiel/react-qr-scanner';
import {
  FiShoppingCart,
  FiPlusCircle,
  FiCamera,
  FiEdit3,
  FiPackage,
} from 'react-icons/fi';
import { useProductStore } from '../store/productStore';
import { ProductForm, SellProductModal } from '../components/products';
import type { SaleData } from '../components/products/SellProductModal';
import { useTransactionStore, createSaleTransaction } from '../store/transactionStore';
import { useCustomerStore } from '../store/customerStore';
import { Product } from '../types';
import { parseBarcode } from '../utils/barcodeGenerator';
import { formatCurrency } from '../utils/formatters';
import { getCategoryLabel } from '../constants/categories';
import { es } from '../i18n/es';

type ScanMode = 'sell' | 'register';

interface ScanResult {
  barcode: string;
  product: Product | null;
  status: 'found' | 'sold' | 'not_found';
  message: string;
}

export function Scanner() {
  const toast = useToast();
  const [mode, setMode] = useState<ScanMode>('sell');
  const [manualBarcode, setManualBarcode] = useState('');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const { getProductByBarcode, updateProduct, addProduct } = useProductStore();
  const { addTransaction } = useTransactionStore();
  const { addPurchase } = useCustomerStore();

  // Modal states
  const {
    isOpen: isSellOpen,
    onOpen: onSellOpen,
    onClose: onSellClose,
  } = useDisclosure();

  const {
    isOpen: isFormOpen,
    onOpen: onFormOpen,
    onClose: onFormClose,
  } = useDisclosure();

  const [productToSell, setProductToSell] = useState<Product | null>(null);
  const [prefillData, setPrefillData] = useState<{ barcode?: string; upsBatch?: number } | null>(null);

  // Process a scanned barcode
  const processBarcode = useCallback((barcode: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) {
      setIsProcessing(false);
      return;
    }

    // Find product by barcode
    const product = getProductByBarcode(trimmedBarcode);

    if (product) {
      if (product.status === 'sold') {
        // Product already sold
        setLastScan({
          barcode: trimmedBarcode,
          product,
          status: 'sold',
          message: 'Este producto ya fue vendido',
        });

        toast({
          title: 'Producto ya vendido',
          description: `${product.name} ya fue vendido`,
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
      } else {
        // Product found and available
        setLastScan({
          barcode: trimmedBarcode,
          product,
          status: 'found',
          message: mode === 'sell' ? 'Listo para vender' : 'Producto encontrado',
        });

        if (mode === 'sell') {
          // Open sell modal
          setProductToSell(product);
          onSellOpen();
        } else {
          toast({
            title: 'Producto ya existe',
            description: `${product.name} ya está registrado`,
            status: 'info',
            duration: 3000,
            isClosable: true,
          });
        }
      }
    } else {
      // Product not found
      const parsed = parseBarcode(trimmedBarcode);

      setLastScan({
        barcode: trimmedBarcode,
        product: null,
        status: 'not_found',
        message: mode === 'sell' ? 'Producto no encontrado' : 'Listo para registrar',
      });

      if (mode === 'sell') {
        toast({
          title: 'No encontrado',
          description: 'No se encontró producto con este código',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      } else {
        // Register mode - pre-fill form
        const upsBatch = parsed?.dropNumber ? parseInt(parsed.dropNumber, 10) : undefined;
        setPrefillData({
          barcode: trimmedBarcode,
          upsBatch,
        });
        onFormOpen();
      }
    }

    setTimeout(() => setIsProcessing(false), 1000); // Debounce
  }, [mode, isProcessing, getProductByBarcode, onSellOpen, onFormOpen, toast]);

  // Handle camera scan
  const handleScan = useCallback((result: { rawValue: string }[]) => {
    if (result && result.length > 0 && result[0].rawValue) {
      processBarcode(result[0].rawValue);
    }
  }, [processBarcode]);

  // Handle manual entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      processBarcode(manualBarcode);
      setManualBarcode('');
    }
  };

  // Handle sale confirmation
  const handleConfirmSale = (saleData: SaleData) => {
    if (!productToSell) return;

    try {
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

      // Update product
      const newQuantity = productToSell.quantity - saleData.quantity;
      const productUpdate: Partial<Product> = { quantity: newQuantity };

      if (newQuantity === 0) {
        productUpdate.status = 'sold';
        productUpdate.soldTo = saleData.customerId;
        productUpdate.soldAt = new Date().toISOString();
      }

      updateProduct(productToSell.id, productUpdate);

      // Update customer balance if credit
      const totalSale = saleData.quantity * productToSell.unitPrice;
      const paidAmount = saleData.cashAmount + saleData.transferAmount + saleData.cardAmount;
      const unpaidAmount = totalSale - paidAmount;

      if (unpaidAmount > 0 && saleData.customerId) {
        addPurchase(saleData.customerId, unpaidAmount);
      }

      toast({
        title: es.sales.saleCompleted,
        description: `${saleData.quantity}x ${productToSell.name}`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      onSellClose();
      setProductToSell(null);
      setLastScan(null);
    } catch (error) {
      toast({
        title: es.errors.saveError,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Handle product registration
  const handleProductSubmit = (data: any) => {
    addProduct({
      ...data,
      status: 'available',
    });

    toast({
      title: es.success.productAdded,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });

    onFormClose();
    setPrefillData(null);
    setLastScan(null);
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      {/* Header */}
      <Heading size={{ base: 'lg', md: 'xl' }}>{es.nav.scanner}</Heading>

      {/* Mode Tabs - Large for elder users */}
      <Tabs
        index={mode === 'sell' ? 0 : 1}
        onChange={(index) => setMode(index === 0 ? 'sell' : 'register')}
        colorScheme="brand"
        variant="soft-rounded"
        size="lg"
      >
        <TabList justifyContent="center" gap={4}>
          <Tab
            minH="70px"
            minW="150px"
            fontSize="lg"
            fontWeight="bold"
            _selected={{ bg: 'green.500', color: 'white' }}
          >
            <VStack spacing={1}>
              <Icon as={FiShoppingCart} boxSize={6} />
              <Text>VENTA</Text>
            </VStack>
          </Tab>
          <Tab
            minH="70px"
            minW="150px"
            fontSize="lg"
            fontWeight="bold"
            _selected={{ bg: 'blue.500', color: 'white' }}
          >
            <VStack spacing={1}>
              <Icon as={FiPlusCircle} boxSize={6} />
              <Text>REGISTRO</Text>
            </VStack>
          </Tab>
        </TabList>
      </Tabs>

      {/* Mode Description */}
      <Alert
        status={mode === 'sell' ? 'success' : 'info'}
        borderRadius="lg"
        justifyContent="center"
      >
        <AlertIcon />
        <Text fontSize="md">
          {mode === 'sell'
            ? 'Escanea un producto para venderlo'
            : 'Escanea un producto nuevo para registrarlo'}
        </Text>
      </Alert>

      {/* Scanner Area */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <VStack spacing={4}>
          {/* Camera Toggle */}
          <Button
            leftIcon={<Icon as={FiCamera} />}
            onClick={() => setCameraEnabled(!cameraEnabled)}
            colorScheme={cameraEnabled ? 'green' : 'gray'}
            size="lg"
            w="full"
          >
            {cameraEnabled ? 'Cámara Activa' : 'Activar Cámara'}
          </Button>

          {/* Camera Preview */}
          {cameraEnabled && (
            <Box
              w="full"
              maxW="400px"
              mx="auto"
              borderRadius="lg"
              overflow="hidden"
              border="3px solid"
              borderColor={mode === 'sell' ? 'green.400' : 'blue.400'}
            >
              <QRScanner
                onScan={handleScan}
                onError={(error) => console.error('Scanner error:', error)}
                constraints={{ facingMode: 'environment' }}
                styles={{
                  container: { width: '100%' },
                  video: { width: '100%' },
                }}
              />
            </Box>
          )}

          <Divider />

          {/* Manual Entry */}
          <Box w="full">
            <form onSubmit={handleManualSubmit}>
              <FormControl>
                <FormLabel fontSize="lg" fontWeight="bold">
                  <HStack>
                    <Icon as={FiEdit3} />
                    <Text>Escribir Código Manualmente</Text>
                  </HStack>
                </FormLabel>
                <HStack>
                  <Input
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    placeholder="Ej: D15-0042"
                    size="lg"
                    fontSize="xl"
                    fontFamily="mono"
                  />
                  <Button
                    type="submit"
                    colorScheme={mode === 'sell' ? 'green' : 'blue'}
                    size="lg"
                    minW="120px"
                  >
                    Buscar
                  </Button>
                </HStack>
              </FormControl>
            </form>
          </Box>
        </VStack>
      </Box>

      {/* Last Scan Result */}
      {lastScan && (
        <Box
          bg="white"
          p={{ base: 4, md: 6 }}
          borderRadius="xl"
          boxShadow="sm"
          border="2px solid"
          borderColor={
            lastScan.status === 'found'
              ? 'green.400'
              : lastScan.status === 'sold'
              ? 'orange.400'
              : 'red.400'
          }
        >
          <VStack align="stretch" spacing={3}>
            <Flex justify="space-between" align="center">
              <Text fontWeight="bold" fontSize="lg" color="gray.600">
                ÚLTIMO ESCANEADO
              </Text>
              <Badge
                colorScheme={
                  lastScan.status === 'found'
                    ? 'green'
                    : lastScan.status === 'sold'
                    ? 'orange'
                    : 'red'
                }
                fontSize="md"
                px={3}
                py={1}
              >
                {lastScan.message}
              </Badge>
            </Flex>

            <HStack spacing={2}>
              <Text fontWeight="medium" color="gray.500">Código:</Text>
              <Text fontFamily="mono" fontSize="lg" fontWeight="bold">
                {lastScan.barcode}
              </Text>
            </HStack>

            {lastScan.product ? (
              <Box bg="gray.50" p={4} borderRadius="lg">
                <VStack align="stretch" spacing={2}>
                  <HStack justify="space-between">
                    <Text fontWeight="bold" fontSize="xl">
                      {lastScan.product.name}
                    </Text>
                    <Text fontWeight="bold" fontSize="xl" color="green.500">
                      {formatCurrency(lastScan.product.unitPrice)}
                    </Text>
                  </HStack>

                  <HStack spacing={2} flexWrap="wrap">
                    <Badge colorScheme="blue">UPS {lastScan.product.upsBatch}</Badge>
                    <Badge colorScheme="purple">
                      {getCategoryLabel(lastScan.product.category)}
                    </Badge>
                    <Badge
                      colorScheme={lastScan.product.status === 'available' ? 'green' : 'gray'}
                    >
                      {lastScan.product.status === 'available'
                        ? es.products.available
                        : es.products.sold}
                    </Badge>
                  </HStack>

                  {(lastScan.product.brand || lastScan.product.color || lastScan.product.size) && (
                    <Text fontSize="sm" color="gray.600">
                      {[lastScan.product.brand, lastScan.product.color, lastScan.product.size]
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                  )}

                  <Text fontSize="sm" color="gray.500">
                    Disponibles: {lastScan.product.quantity} unidades
                  </Text>

                  {/* Action Button */}
                  {lastScan.product.status === 'available' && mode === 'sell' && (
                    <Button
                      colorScheme="green"
                      size="lg"
                      mt={2}
                      leftIcon={<Icon as={FiShoppingCart} />}
                      onClick={() => {
                        setProductToSell(lastScan.product);
                        onSellOpen();
                      }}
                    >
                      Vender Este Producto
                    </Button>
                  )}
                </VStack>
              </Box>
            ) : (
              <Box bg="gray.50" p={4} borderRadius="lg">
                <HStack spacing={3}>
                  <Icon as={FiPackage} boxSize={8} color="gray.400" />
                  <VStack align="start" spacing={0}>
                    <Text color="gray.500">
                      {mode === 'sell'
                        ? 'No se encontró producto con este código'
                        : 'Producto no registrado'}
                    </Text>
                    {mode === 'register' && (
                      <Button
                        colorScheme="blue"
                        size="sm"
                        mt={2}
                        leftIcon={<Icon as={FiPlusCircle} />}
                        onClick={() => {
                          const parsed = parseBarcode(lastScan.barcode);
                          setPrefillData({
                            barcode: lastScan.barcode,
                            upsBatch: parsed?.dropNumber
                              ? parseInt(parsed.dropNumber, 10)
                              : undefined,
                          });
                          onFormOpen();
                        }}
                      >
                        Registrar Ahora
                      </Button>
                    )}
                  </VStack>
                </HStack>
              </Box>
            )}
          </VStack>
        </Box>
      )}

      {/* Sell Product Modal */}
      <SellProductModal
        isOpen={isSellOpen}
        onClose={onSellClose}
        product={productToSell}
        onConfirm={handleConfirmSale}
      />

      {/* Product Form Modal */}
      <ProductForm
        isOpen={isFormOpen}
        onClose={() => {
          onFormClose();
          setPrefillData(null);
        }}
        onSubmit={handleProductSubmit}
        product={null}
        initialUpsBatch={prefillData?.upsBatch}
      />
    </VStack>
  );
}
