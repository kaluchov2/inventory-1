import { useState, useCallback, useMemo } from 'react';
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
  Select,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
} from '@chakra-ui/react';
import { Scanner as QRScanner } from '@yudiel/react-qr-scanner';
import {
  FiShoppingCart,
  FiPlusCircle,
  FiCamera,
  FiEdit3,
  FiPackage,
  FiTrash2,
  FiDollarSign,
} from 'react-icons/fi';
import { useProductStore } from '../store/productStore';
import { ProductForm } from '../components/products';
import { useTransactionStore, createSaleTransaction } from '../store/transactionStore';
import { useCustomerStore } from '../store/customerStore';
import { Product, TransactionItem, PaymentMethod } from '../types';
import { parseBarcode } from '../utils/barcodeGenerator';
import { formatCurrency } from '../utils/formatters';
import { getCategoryLabel } from '../constants/categories';
import { CurrencyInput } from '../components/common';
import { es } from '../i18n/es';
import { deriveStatus } from '../utils/productHelpers';

type ScanMode = 'sell' | 'register';

interface ScanResult {
  barcode: string;
  product: Product | null;
  status: 'found' | 'sold' | 'not_found';
  message: string;
}

interface CartItem extends TransactionItem {
  productId: string;
  maxQuantity: number;
}

export function Scanner() {
  const toast = useToast();
  const [mode, setMode] = useState<ScanMode>('sell');
  const [manualBarcode, setManualBarcode] = useState('');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const { products, getProductByBarcode, updateProduct, addProduct } = useProductStore();
  const { addTransaction } = useTransactionStore();
  const { customers, addPurchase } = useCustomerStore();

  // --- Sell mode: cart state ---
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productToAddToCart, setProductToAddToCart] = useState<Product | null>(null);
  const [qtyToAdd, setQtyToAdd] = useState(1);

  // Payment state (mirrors Sales.tsx)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [amountToPay, setAmountToPay] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [useMixedPayment, setUseMixedPayment] = useState(false);
  const [notes, setNotes] = useState('');

  // AddToCartModal disclosure
  const {
    isOpen: isCartModalOpen,
    onOpen: onCartModalOpen,
    onClose: onCartModalClose,
  } = useDisclosure();

  // Checkout modal disclosure
  const {
    isOpen: isCheckoutOpen,
    onOpen: onCheckoutOpen,
    onClose: onCheckoutClose,
  } = useDisclosure();

  // Register mode: product form
  const {
    isOpen: isFormOpen,
    onOpen: onFormOpen,
    onClose: onFormClose,
  } = useDisclosure();

  const [prefillData, setPrefillData] = useState<{ barcode?: string; upsBatch?: number } | null>(null);

  // --- Derived cart totals ---
  const cartTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  // Sync amountToPay with cart total when cart changes
  // (Only set if checkout isn't already open to avoid overwriting user input)
  const syncAmountToPay = useCallback((total: number) => {
    setAmountToPay(total);
  }, []);

  const paidAmount = useMemo(() => {
    if (useMixedPayment) return cashAmount + transferAmount + cardAmount;
    return amountToPay;
  }, [useMixedPayment, amountToPay, cashAmount, transferAmount, cardAmount]);

  const pendingBalance = Math.max(0, cartTotal - paidAmount);

  const effectivePaymentMethod: PaymentMethod = useMemo(() => {
    if (useMixedPayment) {
      const hasCash = cashAmount > 0;
      const hasTransfer = transferAmount > 0;
      const hasCard = cardAmount > 0;
      const methodCount = [hasCash, hasTransfer, hasCard].filter(Boolean).length;
      if (methodCount > 1) return 'mixed';
      if (pendingBalance > 0) return 'credit';
      if (hasCash) return 'cash';
      if (hasTransfer) return 'transfer';
      if (hasCard) return 'card';
      return 'credit';
    }
    if (pendingBalance > 0) return 'credit';
    return paymentMethod;
  }, [useMixedPayment, paymentMethod, cashAmount, transferAmount, cardAmount, pendingBalance]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const canCompleteSale = useMemo(() => {
    if (cart.length === 0) return false;
    if (pendingBalance > 0 && !selectedCustomerId) return false;
    return true;
  }, [cart.length, pendingBalance, selectedCustomerId]);

  // --- Scan logic ---
  const processBarcode = useCallback((barcode: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) {
      setIsProcessing(false);
      return;
    }

    const product = getProductByBarcode(trimmedBarcode);

    if (product) {
      if (product.availableQty <= 0 && product.soldQty > 0) {
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
        setLastScan({
          barcode: trimmedBarcode,
          product,
          status: 'found',
          message: mode === 'sell' ? 'Listo para agregar' : 'Producto encontrado',
        });

        if (mode === 'sell') {
          // Open AddToCartModal instead of SellProductModal
          setProductToAddToCart(product);
          setQtyToAdd(1);
          onCartModalOpen();
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
        const upsBatch = parsed?.dropNumber ? parseInt(parsed.dropNumber, 10) : undefined;
        setPrefillData({ barcode: trimmedBarcode, upsBatch });
        onFormOpen();
      }
    }

    setCameraEnabled(false);
    setTimeout(() => setIsProcessing(false), 1000);
  }, [mode, isProcessing, getProductByBarcode, onCartModalOpen, onFormOpen, toast]);

  const handleScanAgain = useCallback(() => {
    setLastScan(null);
    setCameraEnabled(true);
  }, []);

  const handleScan = useCallback((result: { rawValue: string }[]) => {
    if (result && result.length > 0 && result[0].rawValue) {
      processBarcode(result[0].rawValue);
    }
  }, [processBarcode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      processBarcode(manualBarcode);
      setManualBarcode('');
    }
  };

  // --- Cart actions ---
  const handleAddToCart = useCallback((qty: number) => {
    if (!productToAddToCart) return;

    const existing = cart.find((item) => item.productId === productToAddToCart.id);
    const currentQty = existing ? existing.quantity : 0;
    const available = productToAddToCart.availableQty - currentQty;

    if (qty > available) {
      toast({
        title: es.errors.notEnoughStock,
        description: `Solo hay ${available} unidades disponibles`,
        status: 'error',
        duration: 3000,
      });
      return;
    }

    if (existing) {
      setCart(
        cart.map((item) =>
          item.productId === productToAddToCart.id
            ? {
                ...item,
                quantity: item.quantity + qty,
                totalPrice: (item.quantity + qty) * item.unitPrice,
              }
            : item,
        ),
      );
    } else {
      const newItem: CartItem = {
        productId: productToAddToCart.id,
        productName: productToAddToCart.name,
        quantity: qty,
        unitPrice: productToAddToCart.unitPrice,
        totalPrice: qty * productToAddToCart.unitPrice,
        category: productToAddToCart.category,
        brand: productToAddToCart.brand,
        color: productToAddToCart.color,
        size: productToAddToCart.size,
        maxQuantity: productToAddToCart.availableQty,
      };
      setCart((prev) => [...prev, newItem]);
    }

    toast({
      title: 'Agregado al carrito',
      description: `${qty}x ${productToAddToCart.name}`,
      status: 'success',
      duration: 2000,
    });

    onCartModalClose();
    setProductToAddToCart(null);
    // Resume camera automatically
    setLastScan(null);
    setCameraEnabled(true);
  }, [cart, productToAddToCart, onCartModalClose, toast]);

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleOpenCheckout = () => {
    syncAmountToPay(cartTotal);
    onCheckoutOpen();
  };

  // --- Complete sale ---
  const handleCompleteSaleScanner = () => {
    if (!canCompleteSale) {
      if (pendingBalance > 0 && !selectedCustomerId) {
        toast({
          title: 'Seleccione un cliente para registrar el saldo pendiente',
          status: 'warning',
          duration: 3000,
        });
      } else {
        toast({ title: 'Agregue productos al carrito', status: 'warning', duration: 3000 });
      }
      return;
    }

    let finalCash = 0;
    let finalTransfer = 0;
    let finalCard = 0;

    if (useMixedPayment) {
      finalCash = cashAmount;
      finalTransfer = transferAmount;
      finalCard = cardAmount;
    } else {
      if (paymentMethod === 'cash') finalCash = amountToPay;
      else if (paymentMethod === 'transfer') finalTransfer = amountToPay;
      else if (paymentMethod === 'card') finalCard = amountToPay;
    }

    const customerName = selectedCustomer?.name || es.customers.walkIn;

    try {
      const transaction = createSaleTransaction(
        { id: selectedCustomerId || undefined, name: customerName },
        cart.map(({ productId, productName, quantity, unitPrice, totalPrice, category, brand, color, size }) => ({
          productId,
          productName,
          quantity,
          unitPrice,
          totalPrice,
          category,
          brand,
          color,
          size,
        })),
        {
          method: effectivePaymentMethod,
          cash: finalCash,
          transfer: finalTransfer,
          card: finalCard,
        },
        {
          notes: notes || undefined,
          isInstallment: pendingBalance > 0,
        },
      );

      addTransaction(transaction);

      // Update product quantities
      cart.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          const updates: Partial<Product> = {
            availableQty: product.availableQty - item.quantity,
            soldQty: product.soldQty + item.quantity,
            soldTo: selectedCustomerId || undefined,
            soldAt: new Date().toISOString(),
          };
          const updatedProduct = { ...product, ...updates };
          updates.status = deriveStatus(updatedProduct as Product);
          updateProduct(product.id, updates);
        }
      });

      // Credit balance
      if (pendingBalance > 0 && selectedCustomerId) {
        addPurchase(selectedCustomerId, pendingBalance);
      }

      const toastTitle =
        pendingBalance > 0
          ? `Venta registrada (Saldo pendiente: ${formatCurrency(pendingBalance)})`
          : es.sales.saleCompleted;

      toast({ title: toastTitle, status: 'success', duration: 4000 });

      // Reset all state
      setCart([]);
      setSelectedCustomerId('');
      setPaymentMethod('cash');
      setAmountToPay(0);
      setUseMixedPayment(false);
      setCashAmount(0);
      setTransferAmount(0);
      setCardAmount(0);
      setNotes('');
      onCheckoutClose();
      handleScanAgain();
    } catch {
      toast({ title: es.errors.saveError, status: 'error', duration: 3000 });
    }
  };

  // --- Register mode: product registration ---
  const handleProductSubmit = (data: any) => {
    addProduct({ ...data, status: 'available' });
    toast({ title: es.success.productAdded, status: 'success', duration: 3000 });
    onFormClose();
    setPrefillData(null);
    handleScanAgain();
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      {/* Header */}
      <Heading size={{ base: 'lg', md: 'xl' }}>{es.nav.scanner}</Heading>

      {/* Mode Tabs */}
      <Tabs
        index={mode === 'sell' ? 0 : 1}
        onChange={(index) => {
          setMode(index === 0 ? 'sell' : 'register');
          // Clear cart when switching modes
          if (index === 1) {
            setCart([]);
            setSelectedCustomerId('');
          }
        }}
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
      <Alert status={mode === 'sell' ? 'success' : 'info'} borderRadius="lg" justifyContent="center">
        <AlertIcon />
        <Text fontSize="md">
          {mode === 'sell'
            ? 'Selecciona un cliente, luego escanea para agregar al carrito'
            : 'Escanea un producto nuevo para registrarlo'}
        </Text>
      </Alert>

      {/* SELL MODE: Client Selection */}
      {mode === 'sell' && (
        <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
          <FormControl>
            <FormLabel fontWeight="bold" fontSize="lg">
              Cliente
            </FormLabel>
            <Select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              placeholder={es.customers.walkIn}
              size="lg"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.balance > 0 ? ` (Saldo: ${formatCurrency(c.balance)})` : ''}
                </option>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

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
                    <Badge colorScheme={lastScan.product.status === 'available' ? 'green' : 'gray'}>
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
                    Disponibles: {lastScan.product.availableQty} unidades
                  </Text>

                  {/* In sell mode, show "Add to cart" button in last scan result too */}
                  {lastScan.product.availableQty > 0 && mode === 'sell' && (
                    <Button
                      colorScheme="green"
                      size="lg"
                      mt={2}
                      leftIcon={<Icon as={FiShoppingCart} />}
                      onClick={() => {
                        setProductToAddToCart(lastScan.product);
                        setQtyToAdd(1);
                        onCartModalOpen();
                      }}
                    >
                      Agregar al Carrito
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

            {/* Scan Again Button */}
            <Button
              leftIcon={<Icon as={FiCamera} />}
              colorScheme="blue"
              size="lg"
              w="full"
              mt={2}
              onClick={handleScanAgain}
            >
              Escanear Otro
            </Button>
          </VStack>
        </Box>
      )}

      {/* SELL MODE: Cart */}
      {mode === 'sell' && cart.length > 0 && (
        <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
          <Heading size={{ base: 'sm', md: 'md' }} mb={4}>
            Carrito
            <Badge ml={2} colorScheme="green">
              {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
            </Badge>
          </Heading>

          <VStack spacing={2} align="stretch" mb={4}>
            {cart.map((item) => (
              <Flex
                key={item.productId}
                p={3}
                bg="gray.50"
                borderRadius="lg"
                justify="space-between"
                align="center"
                gap={2}
              >
                <Box flex={1} minW={0}>
                  <Text fontWeight="medium" noOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {item.quantity} × {formatCurrency(item.unitPrice)}
                  </Text>
                </Box>
                <Text fontWeight="bold" color="green.600">
                  {formatCurrency(item.totalPrice)}
                </Text>
                <IconButton
                  aria-label="Eliminar del carrito"
                  icon={<Icon as={FiTrash2} />}
                  size="sm"
                  colorScheme="red"
                  variant="ghost"
                  onClick={() => handleRemoveFromCart(item.productId)}
                />
              </Flex>
            ))}
          </VStack>

          <Divider mb={4} />

          <Flex justify="space-between" align="center" mb={4}>
            <Text fontSize="xl" fontWeight="bold">Total:</Text>
            <Text fontSize="xl" fontWeight="bold" color="green.500">
              {formatCurrency(cartTotal)}
            </Text>
          </Flex>

          <Button
            colorScheme="green"
            size="lg"
            w="full"
            h="60px"
            fontSize="xl"
            leftIcon={<Icon as={FiDollarSign} />}
            onClick={handleOpenCheckout}
          >
            Completar Venta
          </Button>
        </Box>
      )}

      {/* AddToCartModal */}
      <Modal
        isOpen={isCartModalOpen}
        onClose={() => {
          onCartModalClose();
          setProductToAddToCart(null);
          // Resume camera
          setLastScan(null);
          setCameraEnabled(true);
        }}
        isCentered
      >
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Agregar al Carrito</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {productToAddToCart && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold" fontSize="lg">
                    {productToAddToCart.name}
                  </Text>
                  <HStack spacing={2} mt={1} flexWrap="wrap">
                    <Badge colorScheme="blue">UPS {productToAddToCart.upsBatch}</Badge>
                    <Badge colorScheme="purple">
                      {getCategoryLabel(productToAddToCart.category)}
                    </Badge>
                  </HStack>
                  <Text fontWeight="bold" fontSize="xl" color="green.500" mt={2}>
                    {formatCurrency(productToAddToCart.unitPrice)} c/u
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {productToAddToCart.availableQty} disponibles
                  </Text>
                </Box>

                <FormControl>
                  <FormLabel fontWeight="semibold">Cantidad</FormLabel>
                  <NumberInput
                    min={1}
                    max={productToAddToCart.availableQty}
                    value={qtyToAdd}
                    onChange={(_, val) => setQtyToAdd(val || 1)}
                    size="lg"
                  >
                    <NumberInputField fontSize="xl" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>

                <Flex justify="space-between" align="center" p={3} bg="green.50" borderRadius="lg">
                  <Text fontWeight="semibold">Total:</Text>
                  <Text fontWeight="bold" fontSize="xl" color="green.600">
                    {formatCurrency(qtyToAdd * productToAddToCart.unitPrice)}
                  </Text>
                </Flex>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={3}>
            <Button
              variant="ghost"
              onClick={() => {
                onCartModalClose();
                setProductToAddToCart(null);
                setLastScan(null);
                setCameraEnabled(true);
              }}
            >
              Cancelar
            </Button>
            <Button
              colorScheme="green"
              leftIcon={<Icon as={FiShoppingCart} />}
              onClick={() => handleAddToCart(qtyToAdd)}
              size="lg"
            >
              Agregar al Carrito
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Checkout Modal */}
      <Modal isOpen={isCheckoutOpen} onClose={onCheckoutClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Confirmar Venta</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Cart summary */}
              <Box>
                <Text fontWeight="bold" mb={2}>
                  Productos ({cart.length})
                </Text>
                <VStack spacing={1} align="stretch">
                  {cart.map((item) => (
                    <Flex key={item.productId} justify="space-between">
                      <Text fontSize="sm" noOfLines={1} flex={1}>
                        {item.quantity}× {item.productName}
                      </Text>
                      <Text fontSize="sm" fontWeight="medium" ml={2}>
                        {formatCurrency(item.totalPrice)}
                      </Text>
                    </Flex>
                  ))}
                </VStack>
              </Box>

              <Divider />

              <Flex justify="space-between">
                <Text fontWeight="bold" fontSize="lg">Total:</Text>
                <Text fontWeight="bold" fontSize="lg" color="green.500">
                  {formatCurrency(cartTotal)}
                </Text>
              </Flex>

              {/* Client (read-only display) */}
              <Box p={3} bg="gray.50" borderRadius="md">
                <Text fontSize="sm" color="gray.500">Cliente</Text>
                <Text fontWeight="medium">
                  {selectedCustomer?.name || es.customers.walkIn}
                </Text>
              </Box>

              {/* Customer existing balance warning */}
              {selectedCustomer && selectedCustomer.balance > 0 && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontSize="sm" fontWeight="bold">
                      {selectedCustomer.name} tiene saldo pendiente:{' '}
                      {formatCurrency(selectedCustomer.balance)}
                    </Text>
                  </Box>
                </Alert>
              )}

              {/* Payment Method */}
              <FormControl>
                <FormLabel fontWeight="semibold">{es.sales.paymentMethod}</FormLabel>
                <SimpleGrid columns={3} spacing={2} mb={2}>
                  <Button
                    variant={!useMixedPayment && paymentMethod === 'cash' ? 'solid' : 'outline'}
                    colorScheme="green"
                    onClick={() => { setPaymentMethod('cash'); setUseMixedPayment(false); }}
                  >
                    {es.sales.cash}
                  </Button>
                  <Button
                    variant={!useMixedPayment && paymentMethod === 'transfer' ? 'solid' : 'outline'}
                    colorScheme="blue"
                    onClick={() => { setPaymentMethod('transfer'); setUseMixedPayment(false); }}
                  >
                    {es.sales.transfer}
                  </Button>
                  <Button
                    variant={!useMixedPayment && paymentMethod === 'card' ? 'solid' : 'outline'}
                    colorScheme="purple"
                    onClick={() => { setPaymentMethod('card'); setUseMixedPayment(false); }}
                  >
                    {es.sales.card}
                  </Button>
                </SimpleGrid>
                <Button
                  size="sm"
                  variant={useMixedPayment ? 'solid' : 'outline'}
                  colorScheme="orange"
                  onClick={() => setUseMixedPayment(!useMixedPayment)}
                  w="full"
                >
                  Pago Mixto (múltiples métodos)
                </Button>
              </FormControl>

              {/* Amount inputs */}
              <Box p={4} bg="gray.50" borderRadius="md">
                <FormControl>
                  <FormLabel fontWeight="semibold">Monto a cobrar</FormLabel>
                  {!useMixedPayment ? (
                    <CurrencyInput value={amountToPay} onChange={setAmountToPay} size="lg" />
                  ) : (
                    <VStack spacing={3} align="stretch">
                      <FormControl>
                        <FormLabel fontSize="sm">{es.sales.cash}</FormLabel>
                        <CurrencyInput value={cashAmount} onChange={setCashAmount} />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">{es.sales.transfer}</FormLabel>
                        <CurrencyInput value={transferAmount} onChange={setTransferAmount} />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">{es.sales.card}</FormLabel>
                        <CurrencyInput value={cardAmount} onChange={setCardAmount} />
                      </FormControl>
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontWeight="medium">Total recibido:</Text>
                        <Text fontWeight="bold" color="green.600">
                          {formatCurrency(paidAmount)}
                        </Text>
                      </HStack>
                    </VStack>
                  )}
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Si cobra menos del total, la diferencia queda como saldo pendiente
                  </Text>
                </FormControl>

                {pendingBalance > 0 && (
                  <HStack justify="space-between" mt={3} p={3} bg="orange.100" borderRadius="md">
                    <Text fontWeight="semibold" color="orange.700">Saldo Pendiente:</Text>
                    <Text fontWeight="bold" color="orange.700" fontSize="lg">
                      {formatCurrency(pendingBalance)}
                    </Text>
                  </HStack>
                )}

                {pendingBalance > 0 && !selectedCustomerId && (
                  <Alert status="warning" borderRadius="md" mt={2}>
                    <AlertIcon />
                    <Text fontSize="sm">
                      Seleccione un cliente para registrar el saldo pendiente
                    </Text>
                  </Alert>
                )}
              </Box>

              {/* Notes */}
              <FormControl>
                <FormLabel>{es.sales.notes}</FormLabel>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones..."
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button variant="ghost" onClick={onCheckoutClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="green"
              size="lg"
              leftIcon={<Icon as={FiShoppingCart} />}
              onClick={handleCompleteSaleScanner}
              isDisabled={!canCompleteSale}
            >
              {pendingBalance > 0
                ? `Registrar (Debe ${formatCurrency(pendingBalance)})`
                : 'Confirmar Venta'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Product Form Modal (register mode) */}
      <ProductForm
        isOpen={isFormOpen}
        onClose={() => {
          onFormClose();
          setPrefillData(null);
          handleScanAgain();
        }}
        onSubmit={handleProductSubmit}
        product={null}
        initialUpsBatch={prefillData?.upsBatch}
      />
    </VStack>
  );
}
