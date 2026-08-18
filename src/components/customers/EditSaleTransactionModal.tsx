import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel,
  Alert, AlertIcon, Badge, Box, Button, Divider, FormControl, FormLabel,
  HStack, Icon, IconButton, Input, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay, NumberDecrementStepper,
  NumberIncrementStepper, NumberInput, NumberInputField, NumberInputStepper,
  SimpleGrid, Switch, Text, Textarea, VStack, useDisclosure, useToast,
} from '@chakra-ui/react';
import { FiMinusCircle, FiPlus } from 'react-icons/fi';
import { AutocompleteSelect, ConfirmDialog, CurrencyInput, SatKeySelector } from '../common';
import { connectionStatus } from '../../lib/connectionStatus';
import { syncManager } from '../../lib/syncManager';
import { EditSaleTransactionDetailsPayload, transactionService } from '../../services/transactionService';
import { useCustomerStore } from '../../store/customerStore';
import { useProductStore } from '../../store/productStore';
import { useSatKeyStore } from '../../store/satKeyStore';
import { useTransactionStore } from '../../store/transactionStore';
import { CategoryCode, PaymentMethod, Transaction, TransactionItem } from '../../types';
import { CATEGORY_OPTIONS } from '../../constants/categories';
import { es } from '../../i18n/es';
import { formatCurrency } from '../../utils/formatters';
import { getProductSatSnapshot } from '../../utils/satKeyHelpers';
import { allocateSaleSubtotal, hasInventoryMovement, rescalePaymentAmounts } from '../../utils/saleEditPricing';

interface EditableLine {
  lineId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  satKeyId?: string;
  satKeyCode?: string;
  satKeyDescription?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  isUnregistered: boolean;
}

interface EditSaleTransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updatedTransaction: Transaction) => void;
}

const EPSILON = 0.001;

function isoToLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lineAsTransactionItem(line: EditableLine): TransactionItem {
  return {
    productId: line.productId || '',
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    totalPrice: Number((line.quantity * line.unitPrice).toFixed(6)),
    satKeyId: line.satKeyId,
    satKeyCode: line.satKeyCode,
    satKeyDescription: line.satKeyDescription,
    category: line.category as CategoryCode | undefined,
    brand: line.brand,
    color: line.color,
    size: line.size,
  };
}

export function EditSaleTransactionModal({ transaction, isOpen, onClose, onSaved }: EditSaleTransactionModalProps) {
  const toast = useToast();
  const { products, loadFromSupabase: loadProducts } = useProductStore();
  const satKeys = useSatKeyStore((state) => state.satKeys);
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const loadTransactions = useTransactionStore((state) => state.loadFromSupabase);
  const transactions = useTransactionStore((state) => state.transactions);
  const getEffectivePendingMap = useTransactionStore((state) => state.getEffectivePendingMap);
  const confirm = useDisclosure();
  const unregistered = useDisclosure();

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [dateValue, setDateValue] = useState('');
  const [notes, setNotes] = useState('');
  const [targetTotal, setTargetTotal] = useState(0);
  const [useMixedPayment, setUseMixedPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [amountToPay, setAmountToPay] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [addProductId, setAddProductId] = useState<string | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [selectedUpsFilter, setSelectedUpsFilter] = useState<number | ''>('');
  const [unregName, setUnregName] = useState('');
  const [unregPrice, setUnregPrice] = useState(0);
  const [unregQty, setUnregQty] = useState(1);
  const [unregCategory, setUnregCategory] = useState<CategoryCode | ''>('');
  const [unregBrand, setUnregBrand] = useState('');

  const discount = transaction?.discount || 0;
  const originalPaid = transaction ? transaction.cashAmount + transaction.transferAmount + transaction.cardAmount : 0;
  const paidAmount = useMixedPayment ? cashAmount + transferAmount + cardAmount : amountToPay;
  const pending = Math.max(0, targetTotal - paidAmount);
  const originalDebt = transaction ? Math.max(0, transaction.total - originalPaid) : 0;
  const originalEffectivePending = useMemo(() => {
    if (!transaction?.customerId) return originalDebt;
    return getEffectivePendingMap(transaction.customerId).get(transaction.id) ?? originalDebt;
  }, [getEffectivePendingMap, originalDebt, transaction, transactions]);
  const installmentApplied = Math.max(0, roundMoney(originalDebt - originalEffectivePending));
  const paymentLockedByInstallments = installmentApplied > EPSILON;
  const effectivePending = Math.max(0, roundMoney(pending - installmentApplied));
  const paymentExceedsTotal = paidAmount - targetTotal > EPSILON;
  const creditWithoutCustomer = pending > EPSILON && !transaction?.customerId;
  const parsedDate = localDateTimeToIso(dateValue);

  const allocatedItems = useMemo(() => {
    if (lines.length === 0) return [];
    try {
      return allocateSaleSubtotal(lines.map(lineAsTransactionItem), targetTotal, discount);
    } catch {
      return [];
    }
  }, [discount, lines, targetTotal]);

  const inventoryWillMove = useMemo(
    () => !!transaction && hasInventoryMovement(transaction.items, lines.map(lineAsTransactionItem)),
    [lines, transaction],
  );

  const effectivePaymentMethod = useMemo<PaymentMethod>(() => {
    const hasPending = pending > EPSILON;
    if (useMixedPayment) {
      const count = [cashAmount, transferAmount, cardAmount].filter((amount) => amount > 0).length;
      if (count > 1) return 'mixed';
      if (hasPending) return 'credit';
      if (cashAmount > 0) return 'cash';
      if (transferAmount > 0) return 'transfer';
      if (cardAmount > 0) return 'card';
      return 'credit';
    }
    return hasPending ? 'credit' : paymentMethod;
  }, [cardAmount, cashAmount, paymentMethod, pending, transferAmount, useMixedPayment]);

  const lineProductIds = useMemo(() => new Set(lines.flatMap((line) => line.productId ? [line.productId] : [])), [lines]);
  const selectableProducts = useMemo(() => products
    .filter((product) => product.availableQty > 0 || lineProductIds.has(product.id))
    .filter((product) => Number(product.upsBatch) > 0)
    .sort((a, b) => a.name.localeCompare(b.name)), [lineProductIds, products]);
  const upsFilterOptions = useMemo(() => Array.from(new Set(selectableProducts
    .map((product) => Number(product.upsBatch))
    .filter((ups) => Number.isFinite(ups) && ups > 0)))
    .sort((a, b) => a - b)
    .map((ups) => ({ value: ups, label: `UPS ${ups}` })), [selectableProducts]);
  const filteredProducts = useMemo(() => selectedUpsFilter === ''
    ? selectableProducts
    : selectableProducts.filter((product) => Number(product.upsBatch) === selectedUpsFilter),
  [selectableProducts, selectedUpsFilter]);
  const productOptions = useMemo(() => filteredProducts.map((product) => ({
    value: product.id,
    label: `${product.name} - UPS ${product.upsBatch} (${product.availableQty} disp.)`,
  })), [filteredProducts]);
  const selectedProduct = filteredProducts.find((product) => product.id === addProductId);
  const categoryOptions = useMemo(() => [{ value: '', label: es.transactions.unregisteredNoCategory }, ...CATEGORY_OPTIONS], []);
  const canSave = !isSaving && lines.length > 0 && allocatedItems.length === lines.length &&
    !!parsedDate && targetTotal >= 0 && !paymentExceedsTotal && !creditWithoutCustomer;

  useEffect(() => {
    if (!isOpen || !transaction) return;
    setLines(transaction.items.map((item, index) => ({
      lineId: `${transaction.id}-${index}`,
      productId: item.productId || null,
      productName: item.productName,
      quantity: item.quantity,
      // total_price is the stable historical line weight even when a deployed
      // database previously stored unit_price with only two decimals.
      unitPrice: item.quantity > 0 ? item.totalPrice / item.quantity : item.unitPrice,
      satKeyId: item.satKeyId,
      satKeyCode: item.satKeyCode,
      satKeyDescription: item.satKeyDescription,
      category: item.category,
      brand: item.brand,
      color: item.color,
      size: item.size,
      isUnregistered: !item.productId,
    })));
    setDateValue(isoToLocalDateTime(transaction.date));
    setNotes(transaction.notes || '');
    setTargetTotal(transaction.total);
    const payments = [transaction.cashAmount, transaction.transferAmount, transaction.cardAmount];
    setUseMixedPayment(payments.filter((amount) => amount > 0).length > 1);
    setCashAmount(transaction.cashAmount);
    setTransferAmount(transaction.transferAmount);
    setCardAmount(transaction.cardAmount);
    setAmountToPay(payments.reduce((sum, amount) => sum + amount, 0));
    setPaymentMethod(transaction.cardAmount > 0 ? 'card' : transaction.transferAmount > 0 ? 'transfer' : 'cash');
    setAddProductId(null);
    setAddQuantity(1);
    setSelectedUpsFilter('');
  }, [isOpen, transaction]);

  useEffect(() => {
    if (addProductId && !filteredProducts.some((product) => product.id === addProductId)) setAddProductId(null);
  }, [addProductId, filteredProducts]);

  const setTotalAndKeepFullPayment = (nextValue: number) => {
    const nextTotal = Math.max(0, roundMoney(nextValue));
    const wasFullyPaid = Math.abs(paidAmount - targetTotal) <= EPSILON;
    if (wasFullyPaid) {
      if (useMixedPayment) {
        if (paidAmount > 0) {
          const nextAmounts = rescalePaymentAmounts({
            cash: cashAmount,
            transfer: transferAmount,
            card: cardAmount,
          }, nextTotal);
          setCashAmount(nextAmounts.cash);
          setTransferAmount(nextAmounts.transfer);
          setCardAmount(nextAmounts.card);
        } else {
          setCashAmount(nextTotal);
        }
      } else {
        setAmountToPay(nextTotal);
      }
    }
    setTargetTotal(nextTotal);
  };

  const updateLinesAndTotal = (updater: (current: EditableLine[]) => EditableLine[]) => {
    const next = updater(lines);
    const nextSubtotal = next.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    setLines(next);
    setTotalAndKeepFullPayment(Math.max(0, nextSubtotal - discount));
  };

  const handlePaymentModeChange = (mixed: boolean) => {
    if (mixed) {
      setCashAmount(paymentMethod === 'cash' ? amountToPay : 0);
      setTransferAmount(paymentMethod === 'transfer' ? amountToPay : 0);
      setCardAmount(paymentMethod === 'card' ? amountToPay : 0);
    } else {
      const totalPaid = roundMoney(cashAmount + transferAmount + cardAmount);
      setAmountToPay(totalPaid);
      setPaymentMethod(cardAmount > 0 ? 'card' : transferAmount > 0 ? 'transfer' : 'cash');
    }
    setUseMixedPayment(mixed);
  };

  const handleAddProduct = () => {
    if (!selectedProduct || addQuantity < 1) return;
    updateLinesAndTotal((current) => {
      const existingIndex = current.findIndex((line) => line.productId === selectedProduct.id);
      if (existingIndex >= 0) {
        return current.map((line, index) => index === existingIndex ? { ...line, quantity: line.quantity + addQuantity } : line);
      }
      return [...current, {
        lineId: `${selectedProduct.id}-${Date.now()}`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: addQuantity,
        unitPrice: selectedProduct.unitPrice,
        ...getProductSatSnapshot(selectedProduct, satKeys),
        category: selectedProduct.category,
        brand: selectedProduct.brand,
        color: selectedProduct.color,
        size: selectedProduct.size,
        isUnregistered: false,
      }];
    });
    setAddProductId(null);
    setAddQuantity(1);
  };

  const resetUnregistered = () => {
    setUnregName(''); setUnregPrice(0); setUnregQty(1); setUnregCategory(''); setUnregBrand('');
  };

  const handleAddUnregistered = () => {
    const productName = unregName.trim();
    if (!productName || unregPrice < 0 || unregQty < 1) return;
    updateLinesAndTotal((current) => [...current, {
      lineId: `unregistered-${Date.now()}`,
      productId: null,
      productName,
      quantity: unregQty,
      unitPrice: unregPrice,
      category: unregCategory || undefined,
      brand: unregBrand.trim() || undefined,
      isUnregistered: true,
    }]);
    resetUnregistered();
    unregistered.onClose();
  };

  const paymentAmounts = () => useMixedPayment
    ? { cash: cashAmount, transfer: transferAmount, card: cardAmount }
    : {
        cash: paymentMethod === 'cash' ? amountToPay : 0,
        transfer: paymentMethod === 'transfer' ? amountToPay : 0,
        card: paymentMethod === 'card' ? amountToPay : 0,
      };

  const buildPayload = (): EditSaleTransactionDetailsPayload | null => {
    if (!transaction || !parsedDate || allocatedItems.length !== lines.length) return null;
    const amounts = paymentAmounts();
    return {
      transactionId: transaction.id,
      expectedUpdatedAt: transaction.updatedAt || transaction.createdAt,
      date: parsedDate,
      notes: notes.trim() || undefined,
      total: roundMoney(targetTotal),
      cashAmount: roundMoney(amounts.cash),
      transferAmount: roundMoney(amounts.transfer),
      cardAmount: roundMoney(amounts.card),
      // Send source weights. The RPC owns the single authoritative allocation.
      items: lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice.toFixed(6)),
        totalPrice: Number((line.quantity * line.unitPrice).toFixed(6)),
        satKeyId: line.satKeyId,
        satKeyCode: line.satKeyCode,
        satKeyDescription: line.satKeyDescription,
        category: line.category,
        brand: line.brand,
        color: line.color,
        size: line.size,
      })),
    };
  };

  const notifyError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    const lower = message.toLowerCase();
    const title = lower.includes('payment_exceeds') ? 'El pago supera el total de la venta'
      : lower.includes('credit_requires') ? 'El crédito requiere un cliente registrado'
        : lower.includes('sale_payment_locked_by_installments') ? 'El pago está protegido porque ya existen abonos'
          : lower.includes('sale_modified_concurrently') ? 'La venta cambió en otro dispositivo'
            : lower.includes('insufficient_role') ? 'Tu cuenta no tiene permiso para modificar ventas'
        : lower.includes('sat_key_not_active') ? 'La clave SAT seleccionada ya no está activa'
          : lower.includes('insufficient_stock') ? 'No hay existencias suficientes para modificar la venta'
            : lower.includes('sold_qty_underflow') ? 'Las cantidades vendidas ya no permiten este cambio'
              : lower.includes('migración 026') ? 'Falta desplegar la migración 026' : es.errors.saveError;
    const description = lower.includes('sale_modified_concurrently')
      ? 'Otro usuario guardó cambios mientras este formulario estaba abierto. Ciérralo y vuelve a abrir la venta para revisar la versión más reciente.'
      : lower.includes('sale_payment_locked_by_installments')
        ? 'La venta ya tiene abonos aplicados. El pago original debe conservarse; modifica únicamente los demás datos.'
        : message;
    toast({ title, description, status: 'error', duration: 7000, isClosable: true });
  };

  const handleConfirmSave = async () => {
    const payload = buildPayload();
    if (!payload || !canSave || !transaction) return;
    setIsSaving(true);
    try {
      const connection = connectionStatus.getStatus();
      if (!connection.isOnline || !connection.isSupabaseConnected) throw new Error(es.errors.transactionModifyRequiresOnline);
      await syncManager.syncPendingOperations();
      const syncStatus = syncManager.getStatus();
      if (syncStatus.pendingCount > 0 || syncStatus.deadLetterCount > 0) {
        throw new Error('Hay cambios locales pendientes. Sincronízalos antes de modificar la venta.');
      }
      const { result, transaction: updatedTransaction } = await transactionService.editSaleTransactionDetails(payload);
      let refreshFailed = false;
      try {
        await Promise.all([loadProducts(), loadCustomers(), loadTransactions()]);
      } catch {
        refreshFailed = true;
      }
      onSaved(updatedTransaction);
      confirm.onClose();
      onClose();
      toast({
        title: refreshFailed ? 'Venta guardada; no se pudo recargar todo' : es.success.transactionModified,
        description: `${formatCurrency(result.oldTotal)} → ${formatCurrency(result.newTotal)}`,
        status: refreshFailed ? 'warning' : 'success', duration: 5000, isClosable: true,
      });
    } catch (error) {
      notifyError(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    confirm.onClose();
    onClose();
  };

  if (!transaction) return null;
  const paymentLabel = effectivePaymentMethod === 'mixed' ? 'Mixto'
    : effectivePaymentMethod === 'cash' ? 'Efectivo'
      : effectivePaymentMethod === 'transfer' ? 'Transferencia'
        : effectivePaymentMethod === 'card' ? 'Tarjeta' : 'Crédito';

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent mx={{ base: 2, md: 4 }} maxH={{ base: 'calc(100dvh - 16px)', md: 'calc(100vh - 48px)' }}>
          <ModalHeader>Modificar venta</ModalHeader>
          <ModalCloseButton size="lg" />
          <ModalBody>
            <VStack align="stretch" spacing={5}>
              <HStack justify="space-between" p={3} bg="gray.50" borderRadius="md" flexWrap="wrap">
                <Text fontSize="sm" color="gray.600">ID: {transaction.id}</Text>
                <Badge colorScheme="blue">Venta</Badge>
              </HStack>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Fecha y hora</FormLabel>
                  <Input type="datetime-local" value={dateValue} onChange={(event) => setDateValue(event.target.value)} minH="48px" />
                </FormControl>
                <FormControl isRequired isInvalid={targetTotal < 0}>
                  <FormLabel>Total final</FormLabel>
                  <CurrencyInput value={targetTotal} onChange={setTotalAndKeepFullPayment} size="lg" />
                  <Text fontSize="xs" color="gray.500" mt={1}>El descuento histórico de {formatCurrency(discount)} se conserva.</Text>
                </FormControl>
              </SimpleGrid>

              <Box>
                <Text fontWeight="semibold" mb={3}>Productos y claves SAT</Text>
                <VStack align="stretch" spacing={3}>
                  {lines.map((line, index) => {
                    const allocated = allocatedItems[index];
                    return (
                      <Box key={line.lineId} borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={4}>
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} alignItems="start">
                          <Box>
                            <HStack flexWrap="wrap"><Text fontWeight="semibold">{line.productName}</Text>{line.isUnregistered && <Badge colorScheme="orange">UPS 0</Badge>}</HStack>
                            <Text fontSize="sm" color="gray.600" mt={1}>
                              {line.quantity} × {formatCurrency(allocated?.unitPrice ?? line.unitPrice)} · Total línea{' '}
                              <Text as="span" fontWeight="bold" color="gray.800">{formatCurrency(allocated?.totalPrice ?? line.quantity * line.unitPrice)}</Text>
                            </Text>
                          </Box>
                          <SatKeySelector
                            value={{ satKeyId: line.satKeyId, satKeyCode: line.satKeyCode, satKeyDescription: line.satKeyDescription }}
                            category={line.category}
                            label={`Clave SAT de ${line.productName}`}
                            onChange={(snapshot) => setLines((current) => current.map((item) => item.lineId === line.lineId ? {
                              ...item,
                              satKeyId: snapshot.satKeyId,
                              satKeyCode: snapshot.satKeyCode,
                              satKeyDescription: snapshot.satKeyDescription,
                            } : item))}
                          />
                        </SimpleGrid>
                      </Box>
                    );
                  })}
                </VStack>
              </Box>
              {lines.length === 0 && <Alert status="warning" borderRadius="md"><AlertIcon />Agrega al menos un producto.</Alert>}

              <Accordion allowToggle borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="visible">
                <AccordionItem border="none">
                  <AccordionButton minH="52px" _expanded={{ bg: 'blue.50' }}>
                    <Box flex="1" textAlign="left" fontWeight="semibold">Agregar o quitar productos</Box><AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={5} overflow="visible">
                    <VStack align="stretch" spacing={5}>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                        <FormControl><FormLabel>UPS</FormLabel><AutocompleteSelect options={upsFilterOptions} value={selectedUpsFilter} onChange={(value) => setSelectedUpsFilter(value === '' ? '' : Number(value))} placeholder="Buscar UPS" /></FormControl>
                        <FormControl><FormLabel>Producto</FormLabel><AutocompleteSelect options={productOptions} value={addProductId || ''} onChange={(value) => setAddProductId(value ? String(value) : null)} placeholder="Buscar producto" /></FormControl>
                      </SimpleGrid>
                      <HStack align="end" flexWrap="wrap">
                        <FormControl maxW="140px"><FormLabel>Cantidad</FormLabel><NumberInput min={1} value={addQuantity} onChange={(_, value) => setAddQuantity(Math.max(1, Math.trunc(value || 1)))}><NumberInputField /><NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper></NumberInput></FormControl>
                        <Button leftIcon={<Icon as={FiPlus} />} colorScheme="brand" onClick={handleAddProduct} isDisabled={!selectedProduct}>Agregar producto</Button>
                        <Button leftIcon={<Icon as={FiPlus} />} colorScheme="orange" variant="outline" onClick={unregistered.onOpen}>Agregar UPS 0</Button>
                      </HStack>
                      <Divider />
                      {lines.map((line) => (
                        <HStack key={line.lineId} justify="space-between" align="end" flexWrap="wrap" p={3} bg="gray.50" borderRadius="md">
                          <Text fontWeight="medium" flex="1" minW="180px">{line.productName}</Text>
                          <FormControl maxW="140px"><FormLabel fontSize="sm">Cantidad</FormLabel><NumberInput min={1} value={line.quantity} onChange={(_, value) => updateLinesAndTotal((current) => current.map((item) => item.lineId === line.lineId ? { ...item, quantity: Math.max(1, Math.trunc(value || 1)) } : item))}><NumberInputField /><NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper></NumberInput></FormControl>
                          <IconButton aria-label={`Eliminar ${line.productName}`} icon={<Icon as={FiMinusCircle} />} colorScheme="red" variant="outline" minW="48px" minH="48px" onClick={() => updateLinesAndTotal((current) => current.filter((item) => item.lineId !== line.lineId))} />
                        </HStack>
                      ))}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>

              {paymentLockedByInstallments && (
                <Alert status="info" borderRadius="md" alignItems="flex-start">
                  <AlertIcon mt={1} />
                  <Box>
                    <Text fontWeight="semibold">Esta venta ya recibió {formatCurrency(installmentApplied)} en abonos.</Text>
                    <Text fontSize="sm" mt={1}>
                      El desglose de pago original queda en solo lectura para no contar esos abonos dos veces. Todavía puedes modificar el total, la fecha, la nota y las claves SAT.
                    </Text>
                  </Box>
                </Alert>
              )}

              <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={4}>
                <HStack justify="space-between" mb={4} flexWrap="wrap">
                  <Text fontWeight="semibold">Forma de pago</Text>
                  <FormControl display="flex" alignItems="center" w="auto"><FormLabel htmlFor="edit-mixed-payment" mb="0" fontSize="sm">Pago mixto</FormLabel><Switch id="edit-mixed-payment" isChecked={useMixedPayment} isDisabled={paymentLockedByInstallments} onChange={(event) => handlePaymentModeChange(event.target.checked)} /></FormControl>
                </HStack>
                {!useMixedPayment ? (
                  <VStack align="stretch" spacing={4}>
                    <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3}>
                      {(['cash', 'transfer', 'card'] as const).map((method) => (
                        <Button key={method} minH="48px" variant={paymentMethod === method ? 'solid' : 'outline'} colorScheme={paymentMethod === method ? 'brand' : 'gray'} isDisabled={paymentLockedByInstallments} onClick={() => setPaymentMethod(method)}>
                          {method === 'cash' ? 'Efectivo' : method === 'transfer' ? 'Transferencia' : 'Tarjeta'}
                        </Button>
                      ))}
                    </SimpleGrid>
                    <FormControl><FormLabel>Monto registrado en la venta</FormLabel><CurrencyInput value={amountToPay} onChange={setAmountToPay} size="lg" isDisabled={paymentLockedByInstallments} isInvalid={paymentExceedsTotal} /></FormControl>
                  </VStack>
                ) : (
                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                    <FormControl><FormLabel>Efectivo</FormLabel><CurrencyInput value={cashAmount} onChange={setCashAmount} isDisabled={paymentLockedByInstallments} /></FormControl>
                    <FormControl><FormLabel>Transferencia</FormLabel><CurrencyInput value={transferAmount} onChange={setTransferAmount} isDisabled={paymentLockedByInstallments} /></FormControl>
                    <FormControl><FormLabel>Tarjeta</FormLabel><CurrencyInput value={cardAmount} onChange={setCardAmount} isDisabled={paymentLockedByInstallments} /></FormControl>
                  </SimpleGrid>
                )}
              </Box>
              {paymentExceedsTotal && <Alert status="error" borderRadius="md"><AlertIcon />El pago supera el nuevo total. Ajusta los importes antes de guardar.</Alert>}
              {creditWithoutCustomer && <Alert status="error" borderRadius="md"><AlertIcon />Una venta a crédito requiere un cliente registrado.</Alert>}
              <FormControl><FormLabel>Nota de la venta</FormLabel><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} resize="vertical" /></FormControl>

              <Box bg="gray.50" borderRadius="lg" p={4}>
                <Text fontWeight="semibold" mb={3}>Resumen antes de confirmar</Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                  <HStack justify="space-between"><Text>Total anterior</Text><Text>{formatCurrency(transaction.total)}</Text></HStack>
                  <HStack justify="space-between"><Text>Total nuevo</Text><Text fontWeight="bold">{formatCurrency(targetTotal)}</Text></HStack>
                  <HStack justify="space-between"><Text>Pago original de la venta</Text><Text>{formatCurrency(originalPaid)}</Text></HStack>
                  <HStack justify="space-between"><Text>Pago nuevo en la venta</Text><Text fontWeight="bold">{formatCurrency(paidAmount)}</Text></HStack>
                  {paymentLockedByInstallments && <HStack justify="space-between"><Text>Abonos ya aplicados</Text><Text color="blue.700">{formatCurrency(installmentApplied)}</Text></HStack>}
                  <HStack justify="space-between"><Text>Saldo pendiente tras abonos</Text><Text color={effectivePending > EPSILON ? 'orange.700' : 'green.700'}>{formatCurrency(effectivePending)}</Text></HStack>
                  <HStack justify="space-between"><Text>Método resultante</Text><Badge colorScheme={effectivePaymentMethod === 'credit' ? 'orange' : 'blue'}>{paymentLabel}</Badge></HStack>
                </SimpleGrid>
                <Alert status={inventoryWillMove ? 'warning' : 'info'} mt={4} borderRadius="md"><AlertIcon />{inventoryWillMove ? 'Sí habrá movimiento de inventario por cambios de producto o cantidad.' : 'No habrá movimiento de inventario.'}</Alert>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter><Button variant="ghost" mr={3} onClick={handleClose} isDisabled={isSaving}>Cancelar</Button><Button colorScheme="brand" onClick={confirm.onOpen} isDisabled={!canSave} isLoading={isSaving}>Guardar cambios</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={unregistered.isOpen} onClose={() => { resetUnregistered(); unregistered.onClose(); }} isCentered>
        <ModalOverlay /><ModalContent mx={4}><ModalHeader>Agregar producto UPS 0</ModalHeader><ModalCloseButton />
          <ModalBody><VStack align="stretch" spacing={4}>
            <FormControl isRequired><FormLabel>Nombre</FormLabel><Input value={unregName} onChange={(event) => setUnregName(event.target.value)} autoFocus /></FormControl>
            <FormControl isRequired><FormLabel>Precio base</FormLabel><CurrencyInput value={unregPrice} onChange={setUnregPrice} /></FormControl>
            <FormControl isRequired><FormLabel>Cantidad</FormLabel><NumberInput min={1} value={unregQty} onChange={(_, value) => setUnregQty(Math.max(1, Math.trunc(value || 1)))}><NumberInputField /><NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper></NumberInput></FormControl>
            <FormControl><FormLabel>Categoría</FormLabel><AutocompleteSelect options={categoryOptions} value={unregCategory} onChange={(value) => setUnregCategory(value ? value as CategoryCode : '')} /></FormControl>
            <FormControl><FormLabel>Marca</FormLabel><Input value={unregBrand} onChange={(event) => setUnregBrand(event.target.value)} /></FormControl>
          </VStack></ModalBody>
          <ModalFooter><Button variant="ghost" mr={3} onClick={() => { resetUnregistered(); unregistered.onClose(); }}>Cancelar</Button><Button colorScheme="orange" onClick={handleAddUnregistered} isDisabled={!unregName.trim() || unregQty < 1}>Agregar</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={confirm.isOpen}
        onClose={confirm.onClose}
        onConfirm={handleConfirmSave}
        title="Confirmar modificación de venta"
        message={`Total ${formatCurrency(transaction.total)} → ${formatCurrency(targetTotal)}. Pago registrado ${formatCurrency(originalPaid)} → ${formatCurrency(paidAmount)}.${paymentLockedByInstallments ? ` Abonos conservados ${formatCurrency(installmentApplied)}.` : ''} Saldo pendiente tras abonos ${formatCurrency(effectivePending)}. ${inventoryWillMove ? 'Habrá movimiento de inventario.' : 'No habrá movimiento de inventario.'}`}
        confirmText="Confirmar y guardar"
        cancelText="Cancelar"
        colorScheme="brand"
        isLoading={isSaving}
      />
    </>
  );
}
