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
  Input,
  Box,
  Divider,
  Icon,
  Flex,
  RadioGroup,
  Radio,
  Stack,
  SimpleGrid,
  Switch,
  Alert,
  AlertIcon,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import { FiCheckCircle, FiUserPlus } from 'react-icons/fi';
import { AutocompleteSelect, CurrencyInput } from '../common';
import { Product, PaymentMethod } from '../../types';
import { useCustomerStore } from '../../store/customerStore';
import { formatCurrency } from '../../utils/formatters';
import { getCategoryLabel } from '../../constants/categories';
import { es } from '../../i18n/es';

export type ResolutionType = 'available' | 'sold' | 'donated' | 'lost' | 'expired';

export interface ResolveData {
  productId: string;
  resolution: ResolutionType;
  quantity: number;
  // Only for 'sold' resolution
  customerId?: string;
  customerName?: string;
  paymentMethod?: PaymentMethod;
  cashAmount?: number;
  transferAmount?: number;
  cardAmount?: number;
  salePrice?: number;
  discount?: number;
  // Common
  notes?: string;
}

interface ResolveReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onConfirm: (data: ResolveData) => void;
  isLoading?: boolean;
}

export function ResolveReviewModal({
  isOpen,
  onClose,
  product,
  onConfirm,
  isLoading = false,
}: ResolveReviewModalProps) {
  const { customers, addCustomer } = useCustomerStore();

  // Form state
  const [resolution, setResolution] = useState<ResolutionType>('sold');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [resolveQuantity, setResolveQuantity] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [salePrice, setSalePrice] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [usePartialPayment, setUsePartialPayment] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [notes, setNotes] = useState('');

  // Calculate discount and total for sold resolution
  const discount = product ? Math.max(0, product.unitPrice - salePrice) : 0;
  const total = resolveQuantity * salePrice;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && product) {
      setResolution('sold');
      setResolveQuantity(product.quantity);
      setCustomerId('');
      setIsCreatingClient(false);
      setNewClientName('');
      setSalePrice(product.unitPrice);
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
      return total;
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

  // Validation
  const isValid = useMemo(() => {
    if (!product) return false;

    // For sold resolution, if there's pending balance, must have a customer
    if (resolution === 'sold' && pendingBalance > 0 && !customerId) {
      return false;
    }

    return true;
  }, [product, resolution, pendingBalance, customerId]);

  const handleConfirm = () => {
    if (!product || !isValid) return;

    const data: ResolveData = {
      productId: product.id,
      resolution,
      quantity: resolveQuantity,
      notes: notes || undefined,
    };

    // Add sale-specific data if resolution is 'sold'
    if (resolution === 'sold') {
      data.customerId = customerId || undefined;
      data.customerName = selectedCustomer?.name || es.customers.walkIn;
      data.paymentMethod = effectivePaymentMethod;
      data.salePrice = salePrice;
      data.discount = discount;

      if (usePartialPayment) {
        data.cashAmount = cashAmount;
        data.transferAmount = transferAmount;
        data.cardAmount = cardAmount;
      } else {
        if (paymentMethod === 'cash') {
          data.cashAmount = total;
          data.transferAmount = 0;
          data.cardAmount = 0;
        } else if (paymentMethod === 'transfer') {
          data.cashAmount = 0;
          data.transferAmount = total;
          data.cardAmount = 0;
        } else {
          data.cashAmount = 0;
          data.transferAmount = 0;
          data.cardAmount = total;
        }
      }
    }

    onConfirm(data);
  };

  const handleCreateClient = () => {
    if (!newClientName.trim()) return;
    const newCustomer = addCustomer({ name: newClientName.trim() });
    setCustomerId(newCustomer.id);
    setIsCreatingClient(false);
    setNewClientName('');
  };

  const getResolutionColor = (res: ResolutionType) => {
    switch (res) {
      case 'available': return 'brand';
      case 'sold': return 'green';
      case 'donated': return 'blue';
      case 'lost': return 'pink';
      case 'expired': return 'red';
      default: return 'gray';
    }
  };

  const getResolutionLabel = (res: ResolutionType) => {
    switch (res) {
      case 'available': return 'Disponible';
      case 'sold': return 'Vendido';
      case 'donated': return 'Donado';
      case 'lost': return 'Perdido';
      case 'expired': return 'Caducado';
      default: return res;
    }
  };

  if (!product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <Icon as={FiCheckCircle} />
            <Text>Resolver Producto</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Product Info */}
            <Box bg="yellow.50" p={4} borderRadius="lg" borderWidth={1} borderColor="yellow.200">
              <VStack align="start" spacing={2}>
                <HStack>
                  <Badge colorScheme="yellow">Revisar</Badge>
                  <Text fontWeight="bold" fontSize="lg">
                    {product.name}
                  </Text>
                </HStack>
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
                  Cantidad: {product.quantity} unidades
                </Text>
                {product.notes && (
                  <Box mt={2} p={2} bg="yellow.100" borderRadius="md" width="100%">
                    <Text fontSize="xs" color="yellow.800" fontWeight="semibold">Notas:</Text>
                    <Text fontSize="sm" color="yellow.900">{product.notes}</Text>
                  </Box>
                )}
              </VStack>
            </Box>

            {/* Quantity Selector */}
            {product.quantity > 1 && (
              <FormControl>
                <FormLabel fontWeight="semibold">
                  Cantidad a resolver
                  <Text as="span" fontWeight="normal" color="gray.500" ml={2} fontSize="sm">
                    (de {product.quantity} disponibles)
                  </Text>
                </FormLabel>
                <NumberInput
                  value={resolveQuantity}
                  onChange={(_, val) => setResolveQuantity(Math.max(1, Math.min(product.quantity, val || 1)))}
                  min={1}
                  max={product.quantity}
                  size="md"
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                {resolveQuantity < product.quantity && (
                  <Text fontSize="xs" color="blue.600" mt={1}>
                    {product.quantity - resolveQuantity} unidades permanecerán en revisión
                  </Text>
                )}
              </FormControl>
            )}

            {/* Resolution Type Selection */}
            <FormControl>
              <FormLabel fontWeight="semibold">Tipo de Resolucion</FormLabel>
              <RadioGroup value={resolution} onChange={(val) => setResolution(val as ResolutionType)}>
                <Stack spacing={3}>
                  <Radio value="available" colorScheme="teal">
                    <HStack>
                      <Text>Disponible</Text>
                      <Text fontSize="sm" color="gray.500">- Listo para venta</Text>
                    </HStack>
                  </Radio>
                  <Radio value="sold" colorScheme="green">
                    <HStack>
                      <Text>Vendido</Text>
                      <Text fontSize="sm" color="gray.500">- Crea transaccion de venta</Text>
                    </HStack>
                  </Radio>
                  <Radio value="donated" colorScheme="blue">
                    <HStack>
                      <Text>Donado</Text>
                      <Text fontSize="sm" color="gray.500">- Sin transaccion</Text>
                    </HStack>
                  </Radio>
                  <Radio value="lost" colorScheme="pink">
                    <HStack>
                      <Text>Perdido</Text>
                      <Text fontSize="sm" color="gray.500">- Producto extraviado</Text>
                    </HStack>
                  </Radio>
                  <Radio value="expired" colorScheme="red">
                    <HStack>
                      <Text>Caducado</Text>
                      <Text fontSize="sm" color="gray.500">- Producto vencido</Text>
                    </HStack>
                  </Radio>
                </Stack>
              </RadioGroup>
            </FormControl>

            <Divider />

            {/* Sale-specific fields */}
            {resolution === 'sold' && (
              <>
                {/* Customer Selection */}
                <FormControl>
                  <HStack justify="space-between" mb={1}>
                    <FormLabel mb={0}>{es.sales.selectCustomer}</FormLabel>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme="blue"
                      leftIcon={<Icon as={FiUserPlus} />}
                      onClick={() => setIsCreatingClient(!isCreatingClient)}
                    >
                      {isCreatingClient ? 'Cancelar' : 'Nuevo'}
                    </Button>
                  </HStack>
                  {isCreatingClient ? (
                    <HStack>
                      <Input
                        size="md"
                        placeholder="Nombre del cliente"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClient(); }}
                        autoFocus
                      />
                      <Button
                        size="md"
                        colorScheme="blue"
                        onClick={handleCreateClient}
                        isDisabled={!newClientName.trim()}
                      >
                        Crear
                      </Button>
                    </HStack>
                  ) : (
                    <AutocompleteSelect
                      options={customerOptions}
                      value={customerId}
                      onChange={(val) => setCustomerId(String(val))}
                      placeholder={es.customers.walkIn}
                    />
                  )}
                </FormControl>

                {/* Sale Price */}
                <FormControl>
                  <FormLabel>Precio de Venta (por unidad)</FormLabel>
                  <CurrencyInput value={salePrice} onChange={setSalePrice} size="md" />
                  {product && salePrice !== product.unitPrice && (
                    <HStack mt={1} spacing={2}>
                      <Text fontSize="xs" color="gray.500">
                        Precio original: {formatCurrency(product.unitPrice)}
                      </Text>
                      {discount > 0 && (
                        <Badge colorScheme="orange" fontSize="xs">
                          Descuento: {formatCurrency(discount)}
                        </Badge>
                      )}
                    </HStack>
                  )}
                </FormControl>

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
                </FormControl>

                {/* Simple Payment Method */}
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
              </>
            )}

            {/* Notes - for all resolutions */}
            <FormControl>
              <FormLabel>Notas de Resolucion</FormLabel>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  resolution === 'available'
                    ? 'Observaciones...'
                    : resolution === 'sold'
                    ? 'Observaciones de la venta...'
                    : resolution === 'donated'
                    ? 'Donado a...'
                    : resolution === 'lost'
                    ? 'Circunstancias de la perdida...'
                    : 'Razon de caducidad...'
                }
              />
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {es.actions.cancel}
          </Button>
          <Button
            colorScheme={getResolutionColor(resolution)}
            onClick={handleConfirm}
            isLoading={isLoading}
            isDisabled={!isValid}
            leftIcon={<Icon as={FiCheckCircle} />}
          >
            Marcar {resolveQuantity < (product?.quantity || 0) ? `${resolveQuantity}` : ''} como {getResolutionLabel(resolution)}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
