import { useState, useMemo } from 'react';
import {
  Box,
  Heading,
  VStack,
  HStack,
  Button,
  Icon,
  FormControl,
  FormLabel,
  Select,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Text,
  Divider,
  SimpleGrid,
  IconButton,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Badge,
  Switch,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { FiPlus, FiTrash2, FiShoppingCart, FiDollarSign } from 'react-icons/fi';
import { CurrencyInput } from '../components/common';
import { ProductFilterPanel } from '../components/sales';
import { useProductStore } from '../store/productStore';
import { useCustomerStore } from '../store/customerStore';
import { useTransactionStore, createSaleTransaction } from '../store/transactionStore';
import { TransactionItem, PaymentMethod, Product } from '../types';
import { formatCurrency } from '../utils/formatters';
import { es } from '../i18n/es';

interface CartItem extends TransactionItem {
  productId: string;
  maxQuantity: number;
}

export function Sales() {
  const toast = useToast();

  const { products, updateProduct } = useProductStore();
  const { customers, addPurchase, receivePayment } = useCustomerStore();
  const { addTransaction } = useTransactionStore();

  // Quantity modal state
  const { isOpen: isQuantityModalOpen, onOpen: onQuantityModalOpen, onClose: onQuantityModalClose } = useDisclosure();
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState<Product | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState(1);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [usePartialPayment, setUsePartialPayment] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountNote, setDiscountNote] = useState('');
  const [notes, setNotes] = useState('');

  // Installment state
  const [installmentCustomerId, setInstallmentCustomerId] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [installmentPaymentMethod, setInstallmentPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [installmentNotes, setInstallmentNotes] = useState('');

  // Customers with outstanding balance
  const customersWithBalance = useMemo(() =>
    customers.filter(c => c.balance > 0),
    [customers]
  );

  // Selected customer
  const selectedCustomer = useMemo(() =>
    customers.find(c => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Cart totals
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const total = subtotal - discount;

  // Calculate paid amount
  const paidAmount = useMemo(() => {
    if (!usePartialPayment) {
      return total; // Full payment
    }
    return cashAmount + transferAmount + cardAmount;
  }, [usePartialPayment, total, cashAmount, transferAmount, cardAmount]);

  // Calculate pending balance
  const pendingBalance = Math.max(0, total - paidAmount);

  // Determine effective payment method
  const effectivePaymentMethod: PaymentMethod = useMemo(() => {
    if (!usePartialPayment) {
      return paymentMethod;
    }
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
  }, [usePartialPayment, paymentMethod, cashAmount, transferAmount, cardAmount, pendingBalance]);

  // Handle product selection from filter panel (quick add 1)
  const handleSelectProduct = (product: Product) => {
    addProductToCart(product, 1);
  };

  // Handle add multiple (opens quantity modal)
  const handleAddMultiple = (product: Product) => {
    setSelectedProductForQuantity(product);
    setQuantityToAdd(1);
    onQuantityModalOpen();
  };

  // Confirm quantity modal
  const handleConfirmQuantity = () => {
    if (selectedProductForQuantity && quantityToAdd > 0) {
      addProductToCart(selectedProductForQuantity, quantityToAdd);
      onQuantityModalClose();
      setSelectedProductForQuantity(null);
      setQuantityToAdd(1);
    }
  };

  // Add product to cart
  const addProductToCart = (product: Product, quantity: number) => {
    const existingItem = cart.find(item => item.productId === product.id);
    const currentQty = existingItem ? existingItem.quantity : 0;
    const availableQty = product.quantity - currentQty;

    if (quantity > availableQty) {
      toast({
        title: es.errors.notEnoughStock,
        description: `Solo hay ${availableQty} unidades disponibles`,
        status: 'error',
        duration: 3000,
      });
      return;
    }

    if (existingItem) {
      setCart(cart.map(item =>
        item.productId === product.id
          ? {
              ...item,
              quantity: item.quantity + quantity,
              totalPrice: (item.quantity + quantity) * item.unitPrice,
            }
          : item
      ));
    } else {
      const newItem: CartItem = {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.unitPrice,
        totalPrice: quantity * product.unitPrice,
        category: product.category,
        brand: product.brand,
        color: product.color,
        size: product.size,
        maxQuantity: product.quantity,
      };
      setCart([...cart, newItem]);
    }

    toast({
      title: 'Producto agregado',
      description: `${quantity}x ${product.name}`,
      status: 'success',
      duration: 2000,
    });
  };

  // Remove from cart
  const handleRemoveFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  // Validation
  const canCompleteSale = useMemo(() => {
    if (cart.length === 0) return false;
    // If there's pending balance, must have customer
    if (pendingBalance > 0 && !selectedCustomerId) return false;
    return true;
  }, [cart.length, pendingBalance, selectedCustomerId]);

  // Process sale
  const handleCompleteSale = () => {
    if (!canCompleteSale) {
      if (pendingBalance > 0 && !selectedCustomerId) {
        toast({ title: 'Seleccione un cliente para registrar el saldo pendiente', status: 'warning', duration: 3000 });
      } else {
        toast({ title: 'Agregue productos al carrito', status: 'warning', duration: 3000 });
      }
      return;
    }

    // Calculate final amounts
    let finalCash = 0;
    let finalTransfer = 0;
    let finalCard = 0;

    if (usePartialPayment) {
      finalCash = cashAmount;
      finalTransfer = transferAmount;
      finalCard = cardAmount;
    } else {
      if (paymentMethod === 'cash') {
        finalCash = total;
      } else if (paymentMethod === 'transfer') {
        finalTransfer = total;
      } else if (paymentMethod === 'card') {
        finalCard = total;
      }
    }

    // Create transaction
    const customerName = selectedCustomer?.name || es.customers.walkIn;
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
        discount,
        discountNote: discountNote || undefined,
        notes: notes || undefined,
        isInstallment: pendingBalance > 0,
      }
    );

    addTransaction(transaction);

    // Update product quantities
    cart.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const newQuantity = product.quantity - item.quantity;
        updateProduct(product.id, {
          quantity: newQuantity,
          status: newQuantity === 0 ? 'sold' : 'available',
          soldTo: newQuantity === 0 ? (selectedCustomerId || undefined) : undefined,
          soldAt: newQuantity === 0 ? new Date().toISOString() : undefined,
        });
      }
    });

    // Update customer balance if there's pending amount
    if (pendingBalance > 0 && selectedCustomerId) {
      addPurchase(selectedCustomerId, pendingBalance);
    }

    const toastTitle = pendingBalance > 0
      ? `Venta registrada (Saldo pendiente: ${formatCurrency(pendingBalance)})`
      : es.sales.saleCompleted;

    toast({ title: toastTitle, status: 'success', duration: 3000 });

    // Reset form
    setCart([]);
    setSelectedCustomerId('');
    setPaymentMethod('cash');
    setUsePartialPayment(false);
    setCashAmount(0);
    setTransferAmount(0);
    setCardAmount(0);
    setDiscount(0);
    setDiscountNote('');
    setNotes('');
  };

  // Process installment payment
  const handleReceiveInstallment = () => {
    if (!installmentCustomerId || installmentAmount <= 0) {
      toast({ title: 'Seleccione un cliente y monto válido', status: 'warning', duration: 3000 });
      return;
    }

    const customer = customers.find(c => c.id === installmentCustomerId);
    if (!customer) return;

    if (installmentAmount > customer.balance) {
      toast({ title: 'El monto excede el saldo pendiente', status: 'error', duration: 3000 });
      return;
    }

    // Record installment payment
    addTransaction({
      customerId: installmentCustomerId,
      customerName: customer.name,
      items: [],
      subtotal: 0,
      discount: 0,
      total: installmentAmount,
      paymentMethod: installmentPaymentMethod,
      cashAmount: installmentPaymentMethod === 'cash' ? installmentAmount : 0,
      transferAmount: installmentPaymentMethod === 'transfer' ? installmentAmount : 0,
      cardAmount: 0,
      isInstallment: true,
      installmentAmount,
      remainingBalance: customer.balance - installmentAmount,
      notes: installmentNotes || `Abono recibido - ${installmentPaymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}`,
      date: new Date().toISOString(),
      type: 'installment_payment',
    });

    // Update customer balance
    receivePayment(installmentCustomerId, installmentAmount);

    toast({ title: es.sales.paymentReceived, status: 'success', duration: 3000 });

    // Reset form
    setInstallmentCustomerId('');
    setInstallmentAmount(0);
    setInstallmentNotes('');
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      <Heading size={{ base: 'lg', md: 'xl' }}>{es.sales.title}</Heading>

      <Tabs colorScheme="brand" size={{ base: 'md', md: 'lg' }}>
        <TabList>
          <Tab fontSize={{ base: 'sm', md: 'lg' }} py={{ base: 3, md: 4 }} flex={{ base: 1, md: 'none' }}>
            <Icon as={FiShoppingCart} mr={2} boxSize={{ base: 4, md: 5 }} />
            <Text display={{ base: 'none', sm: 'inline' }}>{es.sales.newSale}</Text>
            <Text display={{ base: 'inline', sm: 'none' }}>Venta</Text>
            {cart.length > 0 && (
              <Badge ml={2} colorScheme="green">{cart.length}</Badge>
            )}
          </Tab>
          <Tab fontSize={{ base: 'sm', md: 'lg' }} py={{ base: 3, md: 4 }} flex={{ base: 1, md: 'none' }}>
            <Icon as={FiDollarSign} mr={2} boxSize={{ base: 4, md: 5 }} />
            <Text display={{ base: 'none', sm: 'inline' }}>{es.sales.receiveInstallment}</Text>
            <Text display={{ base: 'inline', sm: 'none' }}>Abono</Text>
          </Tab>
        </TabList>

        <TabPanels>
          {/* New Sale Tab */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 4, md: 6 }}>
              {/* Left Column - Product Selection */}
              <VStack spacing={{ base: 4, md: 6 }} align="stretch">
                {/* Customer Selection */}
                <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
                  <FormControl>
                    <FormLabel>{es.sales.selectCustomer}</FormLabel>
                    <Select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      placeholder={es.customers.walkIn}
                    >
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.balance > 0 ? `(Saldo: ${formatCurrency(c.balance)})` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                {/* Product Filter Panel */}
                <ProductFilterPanel
                  onSelectProduct={handleSelectProduct}
                  onAddMultiple={handleAddMultiple}
                />
              </VStack>

              {/* Right Column - Cart and Payment */}
              <VStack spacing={{ base: 4, md: 6 }} align="stretch">
                {/* Cart */}
                <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
                  <Heading size={{ base: 'sm', md: 'md' }} mb={4}>
                    Carrito
                    {cart.length > 0 && (
                      <Badge ml={2} colorScheme="green">{cart.length} productos</Badge>
                    )}
                  </Heading>

                  {cart.length === 0 ? (
                    <Text color="gray.500" textAlign="center" py={4}>
                      El carrito está vacío
                    </Text>
                  ) : (
                    <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto">
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
                            <Text fontWeight="medium" noOfLines={1} fontSize={{ base: 'sm', md: 'md' }}>
                              {item.productName}
                            </Text>
                            <Text fontSize="sm" color="gray.500">
                              {item.quantity} x {formatCurrency(item.unitPrice)}
                            </Text>
                          </Box>
                          <Text fontWeight="bold" color="green.600" fontSize={{ base: 'sm', md: 'md' }}>
                            {formatCurrency(item.totalPrice)}
                          </Text>
                          <IconButton
                            aria-label="Eliminar"
                            icon={<Icon as={FiTrash2} />}
                            size="sm"
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => handleRemoveFromCart(item.productId)}
                          />
                        </Flex>
                      ))}
                    </VStack>
                  )}
                </Box>

                {/* Payment */}
                <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
                  <Heading size={{ base: 'sm', md: 'md' }} mb={4}>Pago</Heading>

                  {/* Totals */}
                  <VStack spacing={2} align="stretch" mb={{ base: 4, md: 6 }}>
                    <HStack justify="space-between">
                      <Text fontSize={{ base: 'md', md: 'lg' }}>{es.sales.subtotal}:</Text>
                      <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="medium">
                        {formatCurrency(subtotal)}
                      </Text>
                    </HStack>

                    <FormControl>
                      <Flex justify="space-between" align="center" gap={2} direction={{ base: 'column', sm: 'row' }}>
                        <FormLabel mb={0} flex={{ base: 'none', sm: 1 }}>{es.sales.discount}:</FormLabel>
                        <Box w={{ base: 'full', sm: '150px' }}>
                          <CurrencyInput
                            value={discount}
                            onChange={setDiscount}
                            size="md"
                          />
                        </Box>
                      </Flex>
                    </FormControl>

                    {discount > 0 && (
                      <Input
                        placeholder="Nota del descuento (ej: 50% desc)"
                        value={discountNote}
                        onChange={(e) => setDiscountNote(e.target.value)}
                        size="sm"
                      />
                    )}

                    <Divider />

                    <HStack justify="space-between">
                      <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="bold">{es.sales.total}:</Text>
                      <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="bold" color="green.500">
                        {formatCurrency(total)}
                      </Text>
                    </HStack>
                  </VStack>

                  {/* Partial Payment Toggle */}
                  <FormControl mb={4}>
                    <Flex justify="space-between" align="center">
                      <FormLabel mb={0}>Pago parcial / mixto</FormLabel>
                      <Switch
                        colorScheme="orange"
                        isChecked={usePartialPayment}
                        onChange={(e) => setUsePartialPayment(e.target.checked)}
                      />
                    </Flex>
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      Activa si el cliente no paga el total completo hoy
                    </Text>
                  </FormControl>

                  {/* Simple Payment Method (when not partial) */}
                  {!usePartialPayment && (
                    <FormControl mb={4}>
                      <FormLabel>{es.sales.paymentMethod}</FormLabel>
                      <SimpleGrid columns={3} spacing={2}>
                        <Button
                          variant={paymentMethod === 'cash' ? 'solid' : 'outline'}
                          colorScheme="green"
                          onClick={() => setPaymentMethod('cash')}
                        >
                          {es.sales.cash}
                        </Button>
                        <Button
                          variant={paymentMethod === 'transfer' ? 'solid' : 'outline'}
                          colorScheme="blue"
                          onClick={() => setPaymentMethod('transfer')}
                        >
                          {es.sales.transfer}
                        </Button>
                        <Button
                          variant={paymentMethod === 'card' ? 'solid' : 'outline'}
                          colorScheme="purple"
                          onClick={() => setPaymentMethod('card')}
                        >
                          {es.sales.card}
                        </Button>
                      </SimpleGrid>
                    </FormControl>
                  )}

                  {/* Partial Payment Breakdown */}
                  {usePartialPayment && (
                    <VStack spacing={3} mb={4} p={4} bg="orange.50" borderRadius="md">
                      <Text fontWeight="semibold" color="orange.700" alignSelf="start">
                        Desglose de Pago Recibido
                      </Text>

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

                      <Divider borderColor="orange.200" />

                      <HStack justify="space-between" w="full">
                        <Text fontWeight="medium">Total Recibido:</Text>
                        <Text fontWeight="bold" color="green.600">
                          {formatCurrency(paidAmount)}
                        </Text>
                      </HStack>

                      {pendingBalance > 0 && (
                        <HStack justify="space-between" w="full" p={2} bg="orange.100" borderRadius="md">
                          <Text fontWeight="medium" color="orange.700">
                            Saldo Pendiente:
                          </Text>
                          <Text fontWeight="bold" color="orange.700" fontSize="lg">
                            {formatCurrency(pendingBalance)}
                          </Text>
                        </HStack>
                      )}

                      {pendingBalance > 0 && !selectedCustomerId && (
                        <Alert status="warning" borderRadius="md">
                          <AlertIcon />
                          <Text fontSize="sm">
                            Seleccione un cliente para registrar el saldo pendiente
                          </Text>
                        </Alert>
                      )}
                    </VStack>
                  )}

                  {/* Notes */}
                  <FormControl mb={6}>
                    <FormLabel>{es.sales.notes}</FormLabel>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observaciones..."
                    />
                  </FormControl>

                  {/* Complete Sale Button */}
                  <Button
                    colorScheme="green"
                    size={{ base: 'md', md: 'lg' }}
                    w="full"
                    h={{ base: '50px', md: '60px' }}
                    fontSize={{ base: 'md', md: 'xl' }}
                    leftIcon={<Icon as={FiShoppingCart} />}
                    onClick={handleCompleteSale}
                    isDisabled={!canCompleteSale}
                  >
                    {pendingBalance > 0
                      ? `Registrar Venta (Debe ${formatCurrency(pendingBalance)})`
                      : es.sales.registerSale
                    }
                  </Button>
                </Box>
              </VStack>
            </SimpleGrid>
          </TabPanel>

          {/* Receive Installment Tab */}
          <TabPanel px={0}>
            <Box bg="white" p={{ base: 4, md: 8 }} borderRadius="xl" boxShadow="sm" maxW="600px">
              <Heading size={{ base: 'sm', md: 'md' }} mb={{ base: 4, md: 6 }}>{es.sales.receiveInstallment}</Heading>

              {customersWithBalance.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>
                  No hay clientes con saldo pendiente
                </Text>
              ) : (
                <VStack spacing={6} align="stretch">
                  {/* Customer Selection */}
                  <FormControl isRequired>
                    <FormLabel>{es.sales.selectCustomer}</FormLabel>
                    <Select
                      value={installmentCustomerId}
                      onChange={(e) => setInstallmentCustomerId(e.target.value)}
                      placeholder="Seleccionar cliente..."
                    >
                      {customersWithBalance.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} - Saldo: {formatCurrency(c.balance)}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  {installmentCustomerId && (
                    <>
                      {/* Current Balance */}
                      <Box p={4} bg="orange.50" borderRadius="lg">
                        <Text color="gray.600">Saldo Pendiente:</Text>
                        <Text fontSize="2xl" fontWeight="bold" color="orange.600">
                          {formatCurrency(
                            customers.find(c => c.id === installmentCustomerId)?.balance || 0
                          )}
                        </Text>
                      </Box>

                      {/* Amount */}
                      <FormControl isRequired>
                        <FormLabel>{es.sales.installmentAmount}</FormLabel>
                        <CurrencyInput
                          value={installmentAmount}
                          onChange={setInstallmentAmount}
                          size="lg"
                        />
                      </FormControl>

                      {/* Payment Method */}
                      <FormControl>
                        <FormLabel>{es.sales.paymentMethod}</FormLabel>
                        <HStack>
                          <Button
                            flex={1}
                            variant={installmentPaymentMethod === 'cash' ? 'solid' : 'outline'}
                            colorScheme="green"
                            onClick={() => setInstallmentPaymentMethod('cash')}
                          >
                            {es.sales.cash}
                          </Button>
                          <Button
                            flex={1}
                            variant={installmentPaymentMethod === 'transfer' ? 'solid' : 'outline'}
                            colorScheme="blue"
                            onClick={() => setInstallmentPaymentMethod('transfer')}
                          >
                            {es.sales.transfer}
                          </Button>
                        </HStack>
                      </FormControl>

                      {/* Notes */}
                      <FormControl>
                        <FormLabel>{es.sales.notes}</FormLabel>
                        <Input
                          value={installmentNotes}
                          onChange={(e) => setInstallmentNotes(e.target.value)}
                          placeholder="Observaciones..."
                        />
                      </FormControl>

                      {/* Submit Button */}
                      <Button
                        colorScheme="green"
                        size={{ base: 'md', md: 'lg' }}
                        w="full"
                        h={{ base: '50px', md: '60px' }}
                        fontSize={{ base: 'md', md: 'xl' }}
                        leftIcon={<Icon as={FiDollarSign} />}
                        onClick={handleReceiveInstallment}
                        isDisabled={!installmentCustomerId || installmentAmount <= 0}
                      >
                        Recibir Pago
                      </Button>
                    </>
                  )}
                </VStack>
              )}
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Quantity Modal */}
      <Modal isOpen={isQuantityModalOpen} onClose={onQuantityModalClose} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Agregar al Carrito</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedProductForQuantity && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold">{selectedProductForQuantity.name}</Text>
                  <Text fontSize="sm" color="gray.500">
                    {formatCurrency(selectedProductForQuantity.unitPrice)} c/u
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {selectedProductForQuantity.quantity} disponibles
                  </Text>
                </Box>

                <FormControl>
                  <FormLabel>Cantidad</FormLabel>
                  <NumberInput
                    min={1}
                    max={selectedProductForQuantity.quantity}
                    value={quantityToAdd}
                    onChange={(_, val) => setQuantityToAdd(val || 1)}
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>

                <HStack justify="space-between">
                  <Text>Total:</Text>
                  <Text fontWeight="bold" color="green.600">
                    {formatCurrency(quantityToAdd * selectedProductForQuantity.unitPrice)}
                  </Text>
                </HStack>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onQuantityModalClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="brand"
              onClick={handleConfirmQuantity}
              leftIcon={<Icon as={FiPlus} />}
            >
              Agregar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
