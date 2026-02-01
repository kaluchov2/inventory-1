import { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Badge,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Input,
  SimpleGrid,
  Box,
  Divider,
  Icon,
  Flex,
  Switch,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { FiShoppingCart } from 'react-icons/fi';
import { AutocompleteSelect, CurrencyInput } from '../common';
import { Product, PaymentMethod } from '../../types';
import { useCustomerStore } from '../../store/customerStore';
import { formatCurrency } from '../../utils/formatters';
import { getCategoryLabel } from '../../constants/categories';
import { es } from '../../i18n/es';

export interface SaleData {
  productId: string;
  quantity: number;
  customerId?: string;
  customerName: string;
  paymentMethod: PaymentMethod;
  cashAmount: number;
  transferAmount: number;
  cardAmount: number;
  notes?: string;
}

interface SellProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onConfirm: (saleData: SaleData) => void;
  isLoading?: boolean;
}

export function SellProductModal({
  isOpen,
  onClose,
  product,
  onConfirm,
  isLoading = false,
}: SellProductModalProps) {
  const { customers } = useCustomerStore();

  // Form state
  const [quantity, setQuantity] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [usePartialPayment, setUsePartialPayment] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [notes, setNotes] = useState('');

  // Calculate total
  const total = product ? quantity * product.unitPrice : 0;

  // Reset form when modal opens with a new product
  useEffect(() => {
    if (isOpen && product) {
      setQuantity(1);
      setCustomerId('');
      setPaymentMethod('cash');
      setUsePartialPayment(false);
      setCashAmount(0);
      setTransferAmount(0);
      setCardAmount(0);
      setNotes('');
    }
  }, [isOpen, product?.id]);

  // When total changes and not using partial payment, reset amounts
  useEffect(() => {
    if (!usePartialPayment) {
      setCashAmount(0);
      setTransferAmount(0);
      setCardAmount(0);
    }
  }, [total, usePartialPayment]);

  // Customer options for autocomplete
  const customerOptions = useMemo(() => {
    const options = [
      { value: '', label: es.customers.walkIn },
      ...customers.map((c) => ({
        value: c.id,
        label: c.balance > 0 ? `${c.name} (Saldo: ${formatCurrency(c.balance)})` : c.name,
      })),
    ];
    return options;
  }, [customers]);

  // Selected customer
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  // Calculate paid amount
  const paidAmount = useMemo(() => {
    if (!usePartialPayment) {
      return total; // Full payment
    }
    return cashAmount + transferAmount + cardAmount;
  }, [usePartialPayment, total, cashAmount, transferAmount, cardAmount]);

  // Calculate pending balance (missing amount)
  const pendingBalance = Math.max(0, total - paidAmount);

  // Determine the actual payment method to record
  const effectivePaymentMethod: PaymentMethod = useMemo(() => {
    if (!usePartialPayment) {
      return paymentMethod;
    }
    // Check which amounts are > 0
    const hasCash = cashAmount > 0;
    const hasTransfer = transferAmount > 0;
    const hasCard = cardAmount > 0;
    const methodCount = [hasCash, hasTransfer, hasCard].filter(Boolean).length;

    if (methodCount > 1) return 'mixed';
    if (pendingBalance > 0) return 'credit';
    if (hasCash) return 'cash';
    if (hasTransfer) return 'transfer';
    if (hasCard) return 'card';
    return 'credit'; // No payment at all = full credit
  }, [usePartialPayment, paymentMethod, cashAmount, transferAmount, cardAmount, pendingBalance]);

  // Validation
  const isValid = useMemo(() => {
    if (!product) return false;
    if (quantity < 1 || quantity > product.quantity) return false;

    // If there's pending balance, must have a customer selected
    if (pendingBalance > 0 && !customerId) return false;

    return true;
  }, [product, quantity, pendingBalance, customerId]);

  const handleConfirm = () => {
    if (!product || !isValid) return;

    let finalCash = 0;
    let finalTransfer = 0;
    let finalCard = 0;

    if (usePartialPayment) {
      finalCash = cashAmount;
      finalTransfer = transferAmount;
      finalCard = cardAmount;
    } else {
      // Full payment with selected method
      if (paymentMethod === 'cash') {
        finalCash = total;
      } else if (paymentMethod === 'transfer') {
        finalTransfer = total;
      } else if (paymentMethod === 'card') {
        finalCard = total;
      }
    }

    const saleData: SaleData = {
      productId: product.id,
      quantity,
      customerId: customerId || undefined,
      customerName: selectedCustomer?.name || es.customers.walkIn,
      paymentMethod: effectivePaymentMethod,
      cashAmount: finalCash,
      transferAmount: finalTransfer,
      cardAmount: finalCard,
      notes: notes || undefined,
    };

    onConfirm(saleData);
  };

  if (!product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <Icon as={FiShoppingCart} />
            <Text>Vender Producto</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Product Info */}
            <Box bg="gray.50" p={4} borderRadius="lg">
              <VStack align="start" spacing={2}>
                <Text fontWeight="bold" fontSize="lg">
                  {product.name}
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  <Badge colorScheme="blue">UPS {product.upsBatch}</Badge>
                  <Badge colorScheme="purple">{getCategoryLabel(product.category)}</Badge>
                  <Badge colorScheme="green">{formatCurrency(product.unitPrice)} c/u</Badge>
                </HStack>
                {(product.brand || product.color || product.size) && (
                  <Text fontSize="sm" color="gray.600">
                    {[product.brand, product.color, product.size].filter(Boolean).join(' / ')}
                  </Text>
                )}
                <Text fontSize="sm" color="gray.500">
                  Disponibles: {product.quantity} unidades
                </Text>
              </VStack>
            </Box>

            {/* Quantity */}
            <FormControl>
              <FormLabel>{es.sales.quantity}</FormLabel>
              <NumberInput
                min={1}
                max={product.quantity}
                value={quantity}
                onChange={(_, val) => setQuantity(val || 1)}
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>

            {/* Customer Selection */}
            <FormControl>
              <FormLabel>{es.sales.selectCustomer}</FormLabel>
              <AutocompleteSelect
                options={customerOptions}
                value={customerId}
                onChange={(val) => setCustomerId(String(val))}
                placeholder={es.customers.walkIn}
              />
            </FormControl>

            <Divider />

            {/* Total Display */}
            <Flex justify="space-between" align="center" py={2}>
              <Text fontSize="xl" fontWeight="bold">
                {es.sales.total}:
              </Text>
              <Text fontSize="2xl" fontWeight="bold" color="green.500">
                {formatCurrency(total)}
              </Text>
            </Flex>

            {/* Partial Payment Toggle */}
            <FormControl>
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
              <FormControl>
                <FormLabel>{es.sales.paymentMethod}</FormLabel>
                <SimpleGrid columns={3} spacing={2}>
                  <Button
                    size="sm"
                    variant={paymentMethod === 'cash' ? 'solid' : 'outline'}
                    colorScheme="green"
                    onClick={() => setPaymentMethod('cash')}
                  >
                    {es.sales.cash}
                  </Button>
                  <Button
                    size="sm"
                    variant={paymentMethod === 'transfer' ? 'solid' : 'outline'}
                    colorScheme="blue"
                    onClick={() => setPaymentMethod('transfer')}
                  >
                    {es.sales.transfer}
                  </Button>
                  <Button
                    size="sm"
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
              <VStack spacing={3} align="stretch" p={4} bg="orange.50" borderRadius="md">
                <Text fontWeight="semibold" color="orange.700">
                  Desglose de Pago Recibido
                </Text>

                <FormControl>
                  <FormLabel fontSize="sm">{es.sales.cash}</FormLabel>
                  <CurrencyInput value={cashAmount} onChange={setCashAmount} size="md" />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">{es.sales.transfer}</FormLabel>
                  <CurrencyInput value={transferAmount} onChange={setTransferAmount} size="md" />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">{es.sales.card}</FormLabel>
                  <CurrencyInput value={cardAmount} onChange={setCardAmount} size="md" />
                </FormControl>

                <Divider borderColor="orange.200" />

                <HStack justify="space-between">
                  <Text fontWeight="medium">Total Recibido:</Text>
                  <Text fontWeight="bold" color="green.600">
                    {formatCurrency(paidAmount)}
                  </Text>
                </HStack>

                {pendingBalance > 0 && (
                  <HStack justify="space-between" p={2} bg="orange.100" borderRadius="md">
                    <Text fontWeight="medium" color="orange.700">
                      Saldo Pendiente:
                    </Text>
                    <Text fontWeight="bold" color="orange.700" fontSize="lg">
                      {formatCurrency(pendingBalance)}
                    </Text>
                  </HStack>
                )}

                {pendingBalance > 0 && !customerId && (
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

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {es.actions.cancel}
          </Button>
          <Button
            colorScheme="green"
            onClick={handleConfirm}
            isLoading={isLoading}
            isDisabled={!isValid}
            leftIcon={<Icon as={FiShoppingCart} />}
          >
            {pendingBalance > 0 ? `Vender (Debe ${formatCurrency(pendingBalance)})` : 'Vender'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
