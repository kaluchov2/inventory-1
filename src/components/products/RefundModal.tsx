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
  Textarea,
  Box,
  Divider,
  Icon,
  Flex,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { FiRotateCcw } from 'react-icons/fi';
import { Product, Transaction } from '../../types';
import { useCustomerStore } from '../../store/customerStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getCategoryLabel } from '../../constants/categories';
import { es } from '../../i18n/es';

export interface RefundData {
  productId: string;
  quantity: number;
  transactionId: string;
  notes: string;
}

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  transaction: Transaction | null;
  onConfirm: (data: RefundData) => void;
  isLoading?: boolean;
}

export function RefundModal({
  isOpen,
  onClose,
  product,
  transaction,
  onConfirm,
  isLoading = false,
}: RefundModalProps) {
  const { customers } = useCustomerStore();

  const [refundQuantity, setRefundQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && product) {
      setRefundQuantity(product.soldQty);
      setNotes('');
    }
  }, [isOpen, product?.id]);

  const customerName = useMemo(() => {
    if (!product?.soldTo) return es.customers.walkIn;
    const customer = customers.find(c => c.id === product.soldTo);
    return customer?.name || es.customers.walkIn;
  }, [product?.soldTo, customers]);

  const refundAmount = useMemo(() => {
    if (!product || !transaction) return 0;
    // Proportional refund based on qty
    const perUnitPrice = transaction.total / transaction.items.reduce((sum, i) => sum + i.quantity, 0);
    return refundQuantity * perUnitPrice;
  }, [product, transaction, refundQuantity]);

  const isValid = useMemo(() => {
    if (!product || !transaction) return false;
    if (!notes.trim()) return false;
    if (refundQuantity < 1 || refundQuantity > product.soldQty) return false;
    return true;
  }, [product, transaction, notes, refundQuantity]);

  const handleConfirm = () => {
    if (!product || !transaction || !isValid) return;

    onConfirm({
      productId: product.id,
      quantity: refundQuantity,
      transactionId: transaction.id,
      notes: notes.trim(),
    });
  };

  if (!product || !transaction) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <Icon as={FiRotateCcw} />
            <Text>Devolucion de Producto</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Product Info */}
            <Box bg="orange.50" p={4} borderRadius="lg" borderWidth={1} borderColor="orange.200">
              <VStack align="start" spacing={2}>
                <HStack>
                  <Badge colorScheme="orange">Devolucion</Badge>
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
                  Cantidad vendida: {product.soldQty} unidades
                </Text>
              </VStack>
            </Box>

            {/* Sale Transaction Info */}
            <Box bg="blue.50" p={4} borderRadius="lg" borderWidth={1} borderColor="blue.200">
              <VStack align="start" spacing={1}>
                <Text fontWeight="semibold" color="blue.700" fontSize="sm">
                  Transaccion de Venta Original
                </Text>
                <HStack spacing={4} flexWrap="wrap">
                  <Text fontSize="sm">
                    <Text as="span" color="gray.500">Fecha:</Text>{' '}
                    {formatDate(transaction.date)}
                  </Text>
                  <Text fontSize="sm">
                    <Text as="span" color="gray.500">Cliente:</Text>{' '}
                    {customerName}
                  </Text>
                </HStack>
                <Text fontSize="sm">
                  <Text as="span" color="gray.500">Total pagado:</Text>{' '}
                  <Text as="span" fontWeight="bold" color="green.600">
                    {formatCurrency(transaction.total)}
                  </Text>
                </Text>
                <HStack spacing={2} fontSize="xs" color="gray.500">
                  {transaction.cashAmount > 0 && <Text>Efectivo: {formatCurrency(transaction.cashAmount)}</Text>}
                  {transaction.transferAmount > 0 && <Text>Transferencia: {formatCurrency(transaction.transferAmount)}</Text>}
                  {transaction.cardAmount > 0 && <Text>Tarjeta: {formatCurrency(transaction.cardAmount)}</Text>}
                </HStack>
              </VStack>
            </Box>

            <Divider />

            {/* Quantity Selector */}
            {product.soldQty > 1 && (
              <FormControl>
                <FormLabel fontWeight="semibold">
                  Cantidad a devolver
                  <Text as="span" fontWeight="normal" color="gray.500" ml={2} fontSize="sm">
                    (de {product.soldQty} vendidos)
                  </Text>
                </FormLabel>
                <NumberInput
                  value={refundQuantity}
                  onChange={(_, val) => setRefundQuantity(Math.max(1, Math.min(product.soldQty, val || 1)))}
                  min={1}
                  max={product.soldQty}
                  size="md"
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                {refundQuantity < product.soldQty && (
                  <Text fontSize="xs" color="blue.600" mt={1}>
                    {product.soldQty - refundQuantity} unidades permanecerán como vendidas
                  </Text>
                )}
              </FormControl>
            )}

            {/* Refund Amount */}
            <Flex justify="space-between" align="center" py={2}>
              <Text fontSize="lg" fontWeight="bold">
                Monto a reembolsar:
              </Text>
              <Text fontSize="xl" fontWeight="bold" color="orange.500">
                {formatCurrency(refundAmount)}
              </Text>
            </Flex>

            {/* Notes (required) */}
            <FormControl isRequired>
              <FormLabel fontWeight="semibold">Razon de la devolucion</FormLabel>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Cliente cambio de opinion, producto defectuoso, error al marcar como vendido..."
                rows={3}
              />
              {!notes.trim() && (
                <Text fontSize="xs" color="red.500" mt={1}>
                  La razon es obligatoria para procesar la devolucion
                </Text>
              )}
            </FormControl>

            {/* Warning */}
            <Alert status="warning" borderRadius="md">
              <AlertIcon />
              <Text fontSize="sm">
                Esta accion regresará {refundQuantity} unidad{refundQuantity > 1 ? 'es' : ''} al inventario disponible
                y creará una transaccion de devolucion.
              </Text>
            </Alert>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {es.actions.cancel}
          </Button>
          <Button
            colorScheme="orange"
            onClick={handleConfirm}
            isLoading={isLoading}
            isDisabled={!isValid}
            leftIcon={<Icon as={FiRotateCcw} />}
          >
            Confirmar Devolucion
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
