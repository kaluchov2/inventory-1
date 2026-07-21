import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Text,
  VStack,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { FiMinusCircle, FiPlus } from 'react-icons/fi';
import { ConfirmDialog, AutocompleteSelect } from '../common';
import { connectionStatus } from '../../lib/connectionStatus';
import { syncManager } from '../../lib/syncManager';
import { isMissingDatabaseFunction } from '../../lib/saleSync';
import {
  ModifySaleTransactionPayload,
  RefundSaleFromEditPayload,
  transactionService,
} from '../../services/transactionService';
import { useCustomerStore } from '../../store/customerStore';
import { useProductStore } from '../../store/productStore';
import { useSatKeyStore } from '../../store/satKeyStore';
import { useTransactionStore } from '../../store/transactionStore';
import { CategoryCode, Transaction } from '../../types';
import { CATEGORY_OPTIONS } from '../../constants/categories';
import { es } from '../../i18n/es';
import { formatCurrency, generateId } from '../../utils/formatters';
import { getProductSatSnapshot } from '../../utils/satKeyHelpers';

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

const PENDING_BALANCE_EPSILON = 0.01;
type AutoSettlementMethod = 'cash' | 'transfer' | 'card' | null;

function pickMainPaymentMethod(
  cashAmount: number,
  transferAmount: number,
  cardAmount: number
): AutoSettlementMethod {
  if (cashAmount >= transferAmount && cashAmount >= cardAmount) return 'cash';
  if (transferAmount >= cashAmount && transferAmount >= cardAmount) return 'transfer';
  if (cardAmount >= cashAmount && cardAmount >= transferAmount) return 'card';
  return 'cash'; // unreachable: conditions above are exhaustive for non-negative amounts
}

export function EditSaleTransactionModal({
  transaction,
  isOpen,
  onClose,
  onSaved,
}: EditSaleTransactionModalProps) {
  const toast = useToast();
  const { products, loadFromSupabase: loadProducts } = useProductStore();
  const { satKeys } = useSatKeyStore();
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const loadTransactions = useTransactionStore((state) => state.loadFromSupabase);
  const {
    isOpen: isConfirmOpen,
    onOpen: onConfirmOpen,
    onClose: onConfirmClose,
  } = useDisclosure();
  const {
    isOpen: isUnregisteredOpen,
    onOpen: onUnregisteredOpen,
    onClose: onUnregisteredClose,
  } = useDisclosure();

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [addProductId, setAddProductId] = useState<string | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [selectedUpsFilter, setSelectedUpsFilter] = useState<number | ''>('');
  const [unregName, setUnregName] = useState('');
  const [unregPrice, setUnregPrice] = useState(0);
  const [unregQty, setUnregQty] = useState(1);
  const [unregCategory, setUnregCategory] = useState<CategoryCode | ''>('');
  const [unregBrand, setUnregBrand] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lineSeed, setLineSeed] = useState(0);

  const originalPaidAmount = useMemo(() => {
    if (!transaction) return 0;
    return transaction.cashAmount + transaction.transferAmount + transaction.cardAmount;
  }, [transaction]);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        return sum + line.quantity * line.unitPrice;
      }, 0),
    [lines]
  );

  const discount = transaction?.discount || 0;
  const total = subtotal - discount;
  const oldTotal = transaction?.total || 0;
  const oldUnpaid = Math.max(0, oldTotal - originalPaidAmount);
  const shouldAutoKeepPaid =
    oldUnpaid <= PENDING_BALANCE_EPSILON && total > originalPaidAmount;
  const autoSettlementDelta = shouldAutoKeepPaid
    ? total - originalPaidAmount
    : 0;

  const mainPaymentMethod = useMemo<AutoSettlementMethod>(() => {
    if (!transaction) return null;
    return pickMainPaymentMethod(
      transaction.cashAmount,
      transaction.transferAmount,
      transaction.cardAmount
    );
  }, [transaction]);

  const effectiveCashAmount = (transaction?.cashAmount || 0) +
    (shouldAutoKeepPaid && mainPaymentMethod === 'cash' ? autoSettlementDelta : 0);
  const effectiveTransferAmount = (transaction?.transferAmount || 0) +
    (shouldAutoKeepPaid && mainPaymentMethod === 'transfer' ? autoSettlementDelta : 0);
  const effectiveCardAmount = (transaction?.cardAmount || 0) +
    (shouldAutoKeepPaid && mainPaymentMethod === 'card' ? autoSettlementDelta : 0);
  const effectivePaidAmount =
    effectiveCashAmount + effectiveTransferAmount + effectiveCardAmount;
  const pending = Math.max(0, total - effectivePaidAmount);

  const lineProductIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean) as string[]),
    [lines]
  );

  const selectableProducts = useMemo(() => {
    return products
      .filter((product) => product.availableQty > 0 || lineProductIds.has(product.id))
      .filter((product) => Number(product.upsBatch) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lineProductIds, products]);

  const upsFilterOptions = useMemo(() => {
    const uniqueUps = Array.from(
      new Set(
        selectableProducts
          .map((product) => Number(product.upsBatch))
          .filter((upsBatch) => Number.isFinite(upsBatch) && upsBatch > 0)
      )
    ).sort((a, b) => a - b);

    return uniqueUps.map((upsBatch) => ({
      value: upsBatch,
      label: `UPS ${upsBatch}`,
    }));
  }, [selectableProducts]);

  const filteredSelectableProducts = useMemo(() => {
    if (selectedUpsFilter === '') return selectableProducts;
    return selectableProducts.filter(
      (product) => Number(product.upsBatch) === Number(selectedUpsFilter)
    );
  }, [selectableProducts, selectedUpsFilter]);

  const productOptions = useMemo(
    () =>
      filteredSelectableProducts.map((product) => ({
        value: product.id,
        label: `${product.name} - UPS ${product.upsBatch} (${product.availableQty} disp.)`,
      })),
    [filteredSelectableProducts]
  );

  const selectedProduct = useMemo(
    () => filteredSelectableProducts.find((product) => product.id === addProductId),
    [addProductId, filteredSelectableProducts]
  );
  const unregisteredCategoryOptions = useMemo(
    () => [{ value: '', label: es.transactions.unregisteredNoCategory }, ...CATEGORY_OPTIONS],
    []
  );

  const totalBelowPaidFloor = total + PENDING_BALANCE_EPSILON < effectivePaidAmount;
  const canSave = !isSaving && lines.length > 0;
  const refundAmount = totalBelowPaidFloor
    ? Math.max(effectivePaidAmount - total, 0)
    : 0;
  const autoSettlementMethodLabel =
    mainPaymentMethod === 'transfer'
      ? es.sales.transfer
      : mainPaymentMethod === 'card'
        ? es.sales.card
        : es.sales.cash;

  useEffect(() => {
    if (!isOpen || !transaction) return;

    const initialLines: EditableLine[] = transaction.items.map((item, index) => ({
      lineId: `${transaction.id}-${index}-${Date.now()}`,
      productId: item.productId || null,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      satKeyId: item.satKeyId,
      satKeyCode: item.satKeyCode,
      satKeyDescription: item.satKeyDescription,
      category: item.category,
      brand: item.brand,
      color: item.color,
      size: item.size,
      isUnregistered: !item.productId,
    }));

    setLines(initialLines);
    setAddProductId(null);
    setAddQuantity(1);
    setSelectedUpsFilter('');
    setUnregName('');
    setUnregPrice(0);
    setUnregQty(1);
    setUnregCategory('');
    setUnregBrand('');
    setLineSeed((current) => current + 1);
  }, [isOpen, transaction]);

  useEffect(() => {
    if (!addProductId) return;
    const existsInFilter = filteredSelectableProducts.some(
      (product) => product.id === addProductId
    );
    if (!existsInFilter) {
      setAddProductId(null);
    }
  }, [addProductId, filteredSelectableProducts]);

  const handleClose = () => {
    if (isSaving) return;
    onConfirmClose();
    onClose();
  };

  const handleAddProductLine = () => {
    if (!selectedProduct || addQuantity <= 0) return;

    setLines((current) => {
      const existingIdx = current.findIndex(
        (line) => line.productId === selectedProduct.id
      );

      if (existingIdx >= 0) {
        const next = [...current];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + addQuantity,
        };
        return next;
      }

      return [
        ...current,
        {
          lineId: `${selectedProduct.id}-${lineSeed}-${Date.now()}`,
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
        },
      ];
    });

    setAddProductId(null);
    setAddQuantity(1);
  };

  const resetUnregisteredForm = () => {
    setUnregName('');
    setUnregPrice(0);
    setUnregQty(1);
    setUnregCategory('');
    setUnregBrand('');
  };

  const handleCloseUnregistered = () => {
    if (isSaving) return;
    resetUnregisteredForm();
    onUnregisteredClose();
  };

  const handleAddUnregisteredLine = () => {
    if (isSaving) return;
    const trimmedName = unregName.trim();
    const trimmedBrand = unregBrand.trim();
    if (!trimmedName || unregPrice <= 0 || unregQty < 1) return;

    setLines((current) => {
      const existingIdx = current.findIndex(
        (line) =>
          line.productId === null &&
          line.productName.toLowerCase() === trimmedName.toLowerCase() &&
          line.unitPrice === unregPrice
      );

      if (existingIdx >= 0) {
        const next = [...current];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + unregQty,
        };
        return next;
      }

      return [
        ...current,
        {
          lineId: `unregistered-${lineSeed}-${Date.now()}`,
          productId: null,
          productName: trimmedName,
          quantity: unregQty,
          unitPrice: unregPrice,
          category: unregCategory || undefined,
          brand: trimmedBrand || undefined,
          color: undefined,
          size: undefined,
          isUnregistered: true,
        },
      ];
    });

    resetUnregisteredForm();
    onUnregisteredClose();
  };

  const handleQuantityChange = (lineId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    setLines((current) =>
      current.map((line) =>
        line.lineId === lineId ? { ...line, quantity: Math.trunc(quantity) } : line
      )
    );
  };

  const handleRemoveLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.lineId !== lineId));
  };

  const buildPayload = (): ModifySaleTransactionPayload | null => {
    if (!transaction) return null;

    return {
      transactionId: transaction.id,
      autoKeepPaidIfFullyPaid: true,
      discount: transaction.discount,
      discountNote: transaction.discountNote,
      items: lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.quantity * line.unitPrice,
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

  const buildRefundPayload = (): RefundSaleFromEditPayload | null => {
    if (!transaction) return null;

    return {
      transactionId: transaction.id,
      returnTransactionId: `${transaction.id}-refund-${generateId()}`,
      reason: 'Refund from Clientes modify sale',
      discount: transaction.discount,
      items: lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.quantity * line.unitPrice,
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
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as any).message || '')
        : String(error || '');
    const lower = message.toLowerCase();

    if (isMissingDatabaseFunction(error, 'modify_sale_transaction')) {
      toast({
        title: es.errors.transactionModifyRpcMissing,
        status: 'error',
        duration: 4500,
        isClosable: true,
      });
      return;
    }
    if (isMissingDatabaseFunction(error, 'refund_sale_transaction_from_edit')) {
      toast({
        title: es.errors.transactionRefundRpcMissing,
        status: 'error',
        duration: 4500,
        isClosable: true,
      });
      return;
    }

    if (lower.includes('paid_floor_violation')) {
      toast({
        title: es.errors.transactionModifyPaidFloor,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    if (lower.includes('insufficient_stock')) {
      toast({
        title: es.errors.transactionModifyInsufficientStock,
        description: message,
        status: 'error',
        duration: 4500,
        isClosable: true,
      });
      return;
    }

    if (lower.includes('sold_qty_underflow')) {
      toast({
        title: es.errors.transactionModifySoldUnderflow,
        description: message,
        status: 'error',
        duration: 4500,
        isClosable: true,
      });
      return;
    }

    if (
      lower.includes('transaction_not_sale') ||
      lower.includes('invalid_items_payload') ||
      lower.includes('transaction_requires_at_least_one_item')
    ) {
      toast({
        title: es.errors.transactionModifyInvalidPayload,
        description: message,
        status: 'error',
        duration: 4500,
        isClosable: true,
      });
      return;
    }

    if (
      lower.includes('refund_payload_add_not_allowed') ||
      lower.includes('refund_payload_increase_not_allowed') ||
      lower.includes('refund_payload_no_refund_change') ||
      lower.includes('refund_payload_invalid_totals') ||
      lower.includes('refund_not_required') ||
      lower.includes('refund_total_invalid')
    ) {
      toast({
        title: es.errors.transactionRefundInvalidPayload,
        description: message,
        status: 'error',
        duration: 4500,
        isClosable: true,
      });
      return;
    }

    toast({
      title: es.errors.saveError,
      description: message || es.errors.genericError,
      status: 'error',
      duration: 4500,
      isClosable: true,
    });
  };

  const handleConfirmSave = async () => {
    const payload = buildPayload();
    const refundPayload = buildRefundPayload();
    if (!payload || !refundPayload || !transaction) return;
    if (!canSave) return;

    setIsSaving(true);
    try {
      const conn = connectionStatus.getStatus();
      if (!conn.isOnline || !conn.isSupabaseConnected) {
        toast({
          title: es.errors.transactionModifyRequiresOnline,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
        return;
      }

      await syncManager.syncPendingOperations();
      const syncStatus = syncManager.getStatus();
      if (syncStatus.pendingCount > 0) {
        toast({
          title: es.errors.transactionModifyPendingSync,
          description: `${syncStatus.pendingCount} ${es.transactions.pendingSyncSuffix}`,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
        return;
      }
      if (syncStatus.deadLetterCount > 0) {
        toast({
          title: es.errors.transactionModifyDeadLetter,
          description: `${syncStatus.deadLetterCount} ${es.transactions.failedSyncSuffix}`,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
        return;
      }

      let updatedTransaction = transaction;
      let successTitle = es.success.transactionModified;
      let successDescription = '';

      if (totalBelowPaidFloor) {
        const refundResult =
          await transactionService.refundSaleTransactionFromEdit(refundPayload);
        const sourceAfterRefund = await transactionService.getById(transaction.id);
        if (sourceAfterRefund) {
          updatedTransaction = sourceAfterRefund;
        }
        successTitle = es.success.transactionRefunded;
        successDescription =
          `${formatCurrency(refundResult.refundTotal)} (${refundResult.refundedItemCount} ${es.transactions.refundedLinesLabel})`;
      } else {
        const modifyResult =
          await transactionService.modifySaleTransaction(payload);
        updatedTransaction = modifyResult.transaction;
        successDescription =
          `${formatCurrency(modifyResult.result.oldTotal)} -> ${formatCurrency(modifyResult.result.newTotal)}`;
      }

      let refreshFailed = false;
      try {
        await Promise.all([loadProducts(), loadCustomers(), loadTransactions()]);
      } catch {
        refreshFailed = true;
      }

      onSaved(updatedTransaction);
      onConfirmClose();
      onClose();

      toast({
        title: refreshFailed
          ? es.errors.transactionModifyRefreshWarning
          : successTitle,
        description: refreshFailed
          ? `${successDescription}. ${es.errors.transactionModifyRefreshWarning}`
          : successDescription,
        status: refreshFailed ? 'warning' : 'success',
        duration: 4500,
        isClosable: true,
      });
    } catch (error) {
      notifyError(error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!transaction) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>{es.transactions.editSaleTitle}</ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Box bg="gray.50" p={3} borderRadius="md">
                <HStack justify="space-between" flexWrap="wrap">
                  <Text fontSize="sm" color="gray.600">
                    ID: {transaction.id}
                  </Text>
                  <Badge colorScheme="blue">
                    {es.transactions.saleTypeLabel}
                  </Badge>
                </HStack>
              </Box>

              <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
                <VStack align="stretch" spacing={3}>
                  <Text fontWeight="semibold">{es.transactions.addProductsLabel}</Text>
                  <HStack align="end" flexWrap="wrap">
                    <FormControl minW="180px" maxW="220px">
                      <FormLabel fontSize="sm">{es.products.upsBatch}</FormLabel>
                      <AutocompleteSelect
                        options={upsFilterOptions}
                        value={selectedUpsFilter}
                        onChange={(value) =>
                          setSelectedUpsFilter(value === '' ? '' : Number(value))
                        }
                        placeholder={es.transactions.selectUpsPlaceholder}
                      />
                    </FormControl>
                    <FormControl minW="260px" flex={1}>
                      <FormLabel fontSize="sm">{es.transactions.productLabel}</FormLabel>
                      <AutocompleteSelect
                        options={productOptions}
                        value={addProductId || ''}
                        onChange={(value) => setAddProductId(value ? String(value) : null)}
                        placeholder={es.transactions.selectProductPlaceholder}
                      />
                    </FormControl>
                    <FormControl maxW="120px">
                      <FormLabel fontSize="sm">{es.sales.quantity}</FormLabel>
                      <NumberInput
                        min={1}
                        value={addQuantity}
                        onChange={(_, valueNumber) => setAddQuantity(Math.max(1, valueNumber || 1))}
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    </FormControl>
                    <Button
                      leftIcon={<Icon as={FiPlus} />}
                      colorScheme="brand"
                      onClick={handleAddProductLine}
                      isDisabled={!selectedProduct}
                    >
                      {es.actions.add}
                    </Button>
                    <Button
                      leftIcon={<Icon as={FiPlus} />}
                      colorScheme="orange"
                      variant="outline"
                      onClick={onUnregisteredOpen}
                    >
                      {es.transactions.addUnregisteredLineButton}
                    </Button>
                  </HStack>
                  {selectedUpsFilter !== '' && productOptions.length === 0 && (
                    <Text fontSize="sm" color="gray.500">
                      {es.transactions.noProductsForUps}
                    </Text>
                  )}
                  <Text fontSize="xs" color="gray.400">
                    {es.transactions.onlyUpsProductsNote}
                  </Text>
                </VStack>
              </Box>

              <VStack align="stretch" spacing={3}>
                {lines.map((line) => {
                  const lineTotal = line.quantity * line.unitPrice;
                  return (
                    <Box
                      key={line.lineId}
                      border="1px solid"
                      borderColor="gray.200"
                      borderRadius="md"
                      p={3}
                    >
                      <VStack align="stretch" spacing={2}>
                        <HStack justify="space-between" align="start">
                          <VStack align="start" spacing={0}>
                            <Text fontWeight="medium">{line.productName}</Text>
                            {line.isUnregistered && (
                              <Badge colorScheme="orange" variant="outline">
                                {es.transactions.unregisteredLineLabel}
                              </Badge>
                            )}
                          </VStack>
                          <IconButton
                            aria-label={es.actions.delete}
                            icon={<Icon as={FiMinusCircle} />}
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => handleRemoveLine(line.lineId)}
                          />
                        </HStack>

                        <HStack spacing={3} align="end" flexWrap="wrap">
                          <FormControl maxW="120px">
                            <FormLabel fontSize="sm">{es.sales.quantity}</FormLabel>
                            <NumberInput
                              min={1}
                              value={line.quantity}
                              onChange={(_, valueNumber) =>
                                handleQuantityChange(line.lineId, Math.max(1, valueNumber || 1))
                              }
                            >
                              <NumberInputField />
                              <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                              </NumberInputStepper>
                            </NumberInput>
                          </FormControl>
                          <Box>
                            <Text fontSize="sm" color="gray.500">
                              {es.transactions.unitPriceLabel}
                            </Text>
                            <Text fontWeight="semibold">{formatCurrency(line.unitPrice)}</Text>
                          </Box>
                          <Box>
                            <Text fontSize="sm" color="gray.500">
                              {es.transactions.lineTotalLabel}
                            </Text>
                            <Text fontWeight="semibold">{formatCurrency(lineTotal)}</Text>
                          </Box>
                        </HStack>
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>

              {lines.length === 0 && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  {es.transactions.atLeastOneItemRequired}
                </Alert>
              )}

              <Divider />

              <Box bg="gray.50" p={3} borderRadius="md">
                <VStack align="stretch" spacing={2}>
                  <HStack justify="space-between">
                    <Text>{es.sales.subtotal}</Text>
                    <Text>{formatCurrency(subtotal)}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text>{es.sales.discount}</Text>
                    <Text>{formatCurrency(discount)}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">{es.sales.total}</Text>
                    <Text fontWeight="bold">{formatCurrency(total)}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text>{es.transactions.paidLabel}</Text>
                    <Text>{formatCurrency(effectivePaidAmount)}</Text>
                  </HStack>
                  {shouldAutoKeepPaid && (
                    <Text fontSize="sm" color="blue.600">
                      {es.transactions.autoSettlementNotice}{' '}
                      +{formatCurrency(autoSettlementDelta)} ({autoSettlementMethodLabel})
                    </Text>
                  )}
                  <HStack justify="space-between">
                    <Text>{es.transactions.pendingLabel}</Text>
                    <Text color={pending > 0 ? 'orange.600' : 'green.600'}>
                      {formatCurrency(pending)}
                    </Text>
                  </HStack>
                </VStack>
              </Box>

              {totalBelowPaidFloor && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  {es.transactions.refundModeWarning}{' '}
                  {formatCurrency(refundAmount)}.
                </Alert>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleClose} isDisabled={isSaving}>
              {es.actions.cancel}
            </Button>
            <Button
              colorScheme="brand"
              onClick={onConfirmOpen}
              isDisabled={!canSave}
              isLoading={isSaving}
            >
              {es.actions.save}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isUnregisteredOpen} onClose={handleCloseUnregistered} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>{es.transactions.addUnregisteredModalTitle}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>{es.transactions.unregisteredNameLabel}</FormLabel>
                <Input
                  value={unregName}
                  onChange={(event) => setUnregName(event.target.value)}
                  placeholder={es.transactions.unregisteredNamePlaceholder}
                  autoFocus
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>{es.transactions.unregisteredPriceLabel}</FormLabel>
                <NumberInput
                  min={0}
                  precision={2}
                  value={unregPrice}
                  onChange={(_, valueNumber) => setUnregPrice(Math.max(0, valueNumber || 0))}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>{es.sales.quantity}</FormLabel>
                <NumberInput
                  min={1}
                  value={unregQty}
                  onChange={(_, valueNumber) => setUnregQty(Math.max(1, Math.trunc(valueNumber || 1)))}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel>{es.transactions.unregisteredCategoryLabel}</FormLabel>
                <AutocompleteSelect
                  options={unregisteredCategoryOptions}
                  value={unregCategory}
                  onChange={(value) => setUnregCategory(value === '' ? '' : (value as CategoryCode))}
                  placeholder={es.transactions.unregisteredNoCategory}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{es.products.brand}</FormLabel>
                <Input
                  value={unregBrand}
                  onChange={(event) => setUnregBrand(event.target.value)}
                  placeholder={es.transactions.unregisteredBrandPlaceholder}
                />
              </FormControl>

              {unregPrice > 0 && unregQty > 0 && (
                <HStack justify="space-between" p={3} bg="orange.50" borderRadius="md">
                  <Text fontWeight="medium">{es.sales.total}</Text>
                  <Text fontWeight="bold" color="orange.700">
                    {formatCurrency(unregPrice * unregQty)}
                  </Text>
                </HStack>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseUnregistered}>
              {es.actions.cancel}
            </Button>
            <Button
              colorScheme="orange"
              onClick={handleAddUnregisteredLine}
              isDisabled={!unregName.trim() || unregPrice <= 0 || unregQty < 1}
            >
              {es.transactions.addUnregisteredConfirm}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={onConfirmClose}
        onConfirm={handleConfirmSave}
        title={
          totalBelowPaidFloor
            ? es.transactions.refundConfirmTitle
            : es.transactions.modifyConfirmTitle
        }
        message={
          totalBelowPaidFloor
            ? `${es.transactions.refundConfirmMessage} ${formatCurrency(refundAmount)}.`
            : es.transactions.modifyConfirmMessage
        }
        confirmText={es.actions.confirm}
        cancelText={es.actions.cancel}
        colorScheme="brand"
        isLoading={isSaving}
      />
    </>
  );
}
