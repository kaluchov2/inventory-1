import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Divider,
  Button,
  Icon,
  IconButton,
  Alert,
  AlertIcon,
  Spinner,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { FiDollarSign, FiDownload, FiEdit2, FiRotateCcw } from 'react-icons/fi';
import { Customer, Transaction } from '../../types';
import { useTransactionStore } from '../../store/transactionStore';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { es } from '../../i18n/es';
import { transactionService } from '../../services/transactionService';
import { EditSaleTransactionModal } from './EditSaleTransactionModal';
import { ConfirmDialog } from '../common';
import { connectionStatus } from '../../lib/connectionStatus';
import { syncManager } from '../../lib/syncManager';
import { isMissingDatabaseFunction } from '../../lib/saleSync';
import { useProductStore } from '../../store/productStore';
import { useCustomerStore } from '../../store/customerStore';
import { useStaffStore } from '../../store/staffStore';
import { normalizeCustomerKey } from '../../utils/customerNameUtils';
import { exportSingleTransactionToExcel } from '../../utils/excelExport';

interface CustomerTransactionDetailsProps {
  customer: Customer;
  onReceivePayment: (customer: Customer) => void;
}

const PAGE_SIZE = 5;
type HistoryFilter = 'sale' | 'return' | 'all';

const mergeTransactions = (remote: Transaction[], local: Transaction[]) => {
  const merged = new Map<string, Transaction>();
  local.forEach((tx) => merged.set(tx.id, tx));
  remote.forEach((tx) => merged.set(tx.id, tx));
  return Array.from(merged.values());
};

const paymentMethodLabel: Record<Transaction['paymentMethod'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  mixed: 'Mixto',
  credit: 'Credito',
};

const paymentMethodColor: Record<Transaction['paymentMethod'], string> = {
  cash: 'green',
  transfer: 'blue',
  card: 'purple',
  mixed: 'orange',
  credit: 'gray',
};

const transactionTypeLabel: Record<Transaction['type'], string> = {
  sale: 'Venta',
  return: 'Devolucion',
  adjustment: 'Ajuste',
  installment_payment: 'Abono',
};

function getLatestTransactionsForCustomer(
  source: Transaction[],
  customerId: string,
  customerName: string,
) {
  const customerNameKey = normalizeCustomerKey(customerName);

  return source
    .filter(
      (tx) =>
        tx.customerId === customerId ||
        normalizeCustomerKey(tx.customerName) === customerNameKey,
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function CustomerTransactionDetails({
  customer,
  onReceivePayment,
}: CustomerTransactionDetailsProps) {
  const toast = useToast();
  const {
    transactions,
    getUnpaidTransactionsByCustomer,
    getEffectivePendingMap,
    loadFromSupabase: loadTransactions,
  } = useTransactionStore();
  const loadProducts = useProductStore((state) => state.loadFromSupabase);
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const staff = useStaffStore((state) => state.staff);
  const {
    isOpen: isUndoConfirmOpen,
    onOpen: onUndoConfirmOpen,
    onClose: onUndoConfirmClose,
  } = useDisclosure();

  const [latestTransactions, setLatestTransactions] = useState<Transaction[]>([]);
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [transactionToUndo, setTransactionToUndo] = useState<Transaction | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('sale');

  const unpaidTransactions = useMemo(
    () => getUnpaidTransactionsByCustomer(customer.id),
    [customer.id, getUnpaidTransactionsByCustomer]
  );

  const effectivePendingMap = useMemo(
    () => getEffectivePendingMap(customer.id),
    [customer.id, getEffectivePendingMap]
  );

  const totalPending = useMemo(
    () =>
      unpaidTransactions.reduce(
        (sum, t) => sum + (effectivePendingMap.get(t.id) ?? 0),
        0
      ),
    [unpaidTransactions, effectivePendingMap]
  );

  const filteredHistoryTransactions = useMemo(() => {
    if (historyFilter === 'all') return latestTransactions;
    return latestTransactions.filter((transaction) => transaction.type === historyFilter);
  }, [historyFilter, latestTransactions]);

  const visibleTransactions = useMemo(
    () => filteredHistoryTransactions.slice(0, visibleCount),
    [filteredHistoryTransactions, visibleCount]
  );

  const canLoadMore = visibleCount < filteredHistoryTransactions.length;
  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member.name])),
    [staff]
  );

  useEffect(() => {
    setLatestTransactions(
      getLatestTransactionsForCustomer(transactions, customer.id, customer.name)
    );
    setVisibleCount(PAGE_SIZE);
  }, [customer.id, customer.name, transactions]);

  const handleHistoryFilterChange = (nextFilter: HistoryFilter) => {
    setHistoryFilter(nextFilter);
    setVisibleCount(PAGE_SIZE);
  };

  useEffect(() => {
    let isMounted = true;

    const loadLatestTransactions = async () => {
      setIsLoadingLatest(true);
      setLatestError(null);

      try {
        const remoteTransactions = await Promise.race([
          Promise.all([
            transactionService.getByCustomer(customer.id),
            transactionService.getSalesForCustomer(customer.id, customer.name),
          ]).then(([byCustomer, byNameSales]) =>
            mergeTransactions(byCustomer, byNameSales)
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('transaction_fetch_timeout')), 15000)
          ),
        ]);

        if (!isMounted) return;

        const localSnapshot = useTransactionStore.getState().transactions;
        const merged = mergeTransactions(remoteTransactions, localSnapshot);
        setLatestTransactions(
          getLatestTransactionsForCustomer(merged, customer.id, customer.name)
        );
        setVisibleCount(PAGE_SIZE);
      } catch (error) {
        console.warn(
          '[CustomerTransactionDetails] Remote query failed, using local cache:',
          error
        );
        if (!isMounted) return;
        const localSnapshot = useTransactionStore.getState().transactions;
        const localForCustomer = getLatestTransactionsForCustomer(
          localSnapshot,
          customer.id,
          customer.name
        );
        setLatestTransactions(localForCustomer);
        setVisibleCount(PAGE_SIZE);
        setLatestError(
          localForCustomer.length === 0
            ? 'No se pudo completar consulta remota. Mostrando cache local.'
            : null
        );
      } finally {
        if (isMounted) setIsLoadingLatest(false);
      }
    };

    loadLatestTransactions();

    return () => {
      isMounted = false;
    };
  }, [customer.id, customer.name]);

  const handleUndoClick = (transaction: Transaction) => {
    setTransactionToUndo(transaction);
    onUndoConfirmOpen();
  };

  const handleExportTransaction = (transaction: Transaction) => {
    try {
      const soldByName = transaction.soldBy
        ? (staffById.get(transaction.soldBy) || transaction.soldBy)
        : undefined;
      exportSingleTransactionToExcel(transaction, soldByName);
      toast({
        title: 'Transaccion descargada',
        description: `${formatDate(transaction.date)} - ${transaction.customerName}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: es.errors.exportError,
        description: String(error || es.errors.genericError),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleConfirmUndo = async () => {
    if (!transactionToUndo) return;

    setIsUndoing(true);
    try {
      const conn = connectionStatus.getStatus();
      if (!conn.isOnline || !conn.isSupabaseConnected) {
        toast({
          title: es.errors.transactionUndoRequiresOnline,
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
          title: es.errors.transactionUndoPendingSync,
          description: `${syncStatus.pendingCount} ${es.transactions.pendingSyncSuffix}`,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
        return;
      }

      if (syncStatus.deadLetterCount > 0) {
        toast({
          title: es.errors.transactionUndoDeadLetter,
          description: `${syncStatus.deadLetterCount} ${es.transactions.failedSyncSuffix}`,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
        return;
      }

      const undoResult = await transactionService.undoSaleTransaction({
        transactionId: transactionToUndo.id,
        reason: 'Undo requested from Clientes',
      });

      let refreshFailed = false;
      try {
        await Promise.all([loadProducts(), loadCustomers(), loadTransactions()]);
      } catch (refreshError) {
        refreshFailed = true;
        console.warn(
          '[CustomerTransactionDetails] Undo committed but refresh failed:',
          refreshError
        );
      }

      setLatestTransactions((current) =>
        current.filter((tx) => tx.id !== transactionToUndo.id)
      );
      setVisibleCount(PAGE_SIZE);
      const skippedRefsNote =
        undoResult.skippedProductRefs && undoResult.skippedProductRefs > 0
          ? ` ${undoResult.skippedProductRefs} referencia(s) sin inventario fueron omitidas.`
          : '';

      toast({
        title: es.success.transactionUndone,
        description: refreshFailed
          ? `${formatCurrency(undoResult.total)} revertido.${skippedRefsNote} ${es.errors.transactionUndoRefreshWarning}`
          : `${formatCurrency(undoResult.total)} revertido.${skippedRefsNote}`,
        status: refreshFailed ? 'warning' : 'success',
        duration: 4500,
        isClosable: true,
      });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message || '')
          : String(error || '');
      const lower = message.toLowerCase();

      if (isMissingDatabaseFunction(error, 'undo_sale_transaction')) {
        toast({
          title: es.errors.transactionUndoRpcMissing,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
      } else if (lower.includes('sold_qty_underflow')) {
        toast({
          title: es.errors.transactionUndoSoldUnderflow,
          description: message,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
      } else if (lower.includes('transaction_not_found')) {
        toast({
          title: es.errors.transactionUndoNotFound,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
      } else {
        toast({
          title: es.errors.saveError,
          description: message || es.errors.genericError,
          status: 'error',
          duration: 4500,
          isClosable: true,
        });
      }
    } finally {
      setIsUndoing(false);
      setTransactionToUndo(null);
      onUndoConfirmClose();
    }
  };

  const pendingSection =
    customer.balance > 0 && unpaidTransactions.length === 0 ? (
      <Box bg="blue.50" p={4} borderRadius="lg">
        <VStack align="stretch" spacing={3}>
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Text fontSize="sm">
              No hay transacciones pendientes registradas. El saldo puede ser de
              compras anteriores no rastreadas.
            </Text>
          </Alert>
          <Button
            leftIcon={<Icon as={FiDollarSign} />}
            colorScheme="green"
            size="sm"
            alignSelf="flex-end"
            onClick={() => onReceivePayment(customer)}
          >
            {es.sales.receiveInstallment}
          </Button>
        </VStack>
      </Box>
    ) : unpaidTransactions.length === 0 ? (
      <Box bg="green.50" p={4} borderRadius="lg">
        <Text fontSize="sm" color="green.700" fontWeight="medium">
          Sin transacciones pendientes
        </Text>
      </Box>
    ) : (
      <Box bg="blue.50" p={4} borderRadius="lg">
        <VStack align="stretch" spacing={4}>
          <Text fontWeight="semibold" color="blue.700">
            Transacciones Pendientes
          </Text>

          {unpaidTransactions.map((transaction) => {
            const pending = effectivePendingMap.get(transaction.id) ?? 0;
            const totalPaid = transaction.total - pending;

            return (
              <Box
                key={transaction.id}
                bg="white"
                p={3}
                borderRadius="md"
                border="1px solid"
                borderColor="blue.100"
              >
                <VStack align="stretch" spacing={2}>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.600">
                      {formatDate(transaction.date)}
                    </Text>
                    <Badge colorScheme="orange" fontSize="sm">
                      Debe: {formatCurrency(pending)}
                    </Badge>
                  </HStack>

                  {transaction.items.map((item) => (
                    <HStack
                      key={item.productId}
                      justify="space-between"
                      fontSize="sm"
                    >
                      <Text noOfLines={1} flex={1}>
                        {item.productName}
                      </Text>
                      <Text color="gray.500" whiteSpace="nowrap" mx={2}>
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </Text>
                      <Text fontWeight="medium" whiteSpace="nowrap">
                        {formatCurrency(item.totalPrice)}
                      </Text>
                    </HStack>
                  ))}

                  <Divider borderColor="blue.100" />

                  <HStack justify="space-between" fontSize="sm">
                    <Text color="gray.500">Total</Text>
                    <Text fontWeight="bold">{formatCurrency(transaction.total)}</Text>
                  </HStack>
                  <HStack justify="space-between" fontSize="sm">
                    <Text color="gray.500">Pagado</Text>
                    <Text color="green.600">{formatCurrency(totalPaid)}</Text>
                  </HStack>

                  {totalPaid > 0 && (
                    <HStack spacing={4} flexWrap="wrap">
                      {transaction.cashAmount > 0 && (
                        <HStack>
                          <Badge colorScheme="green" variant="outline">
                            Efectivo
                          </Badge>
                          <Text fontSize="sm">
                            {formatCurrency(transaction.cashAmount)}
                          </Text>
                        </HStack>
                      )}
                      {transaction.transferAmount > 0 && (
                        <HStack>
                          <Badge colorScheme="blue" variant="outline">
                            Transferencia
                          </Badge>
                          <Text fontSize="sm">
                            {formatCurrency(transaction.transferAmount)}
                          </Text>
                        </HStack>
                      )}
                      {transaction.cardAmount > 0 && (
                        <HStack>
                          <Badge colorScheme="purple" variant="outline">
                            Tarjeta
                          </Badge>
                          <Text fontSize="sm">
                            {formatCurrency(transaction.cardAmount)}
                          </Text>
                        </HStack>
                      )}
                    </HStack>
                  )}

                  {transaction.notes && (
                    <Text fontSize="sm" fontStyle="italic" color="gray.500">
                      {transaction.notes}
                    </Text>
                  )}
                </VStack>
              </Box>
            );
          })}

          <Divider borderColor="blue.200" />
          <HStack justify="space-between" align="center">
            <HStack spacing={2}>
              <Text fontWeight="semibold" color="blue.700">
                Total Pendiente:
              </Text>
              <Badge colorScheme="red" fontSize="md" px={2} py={1}>
                {formatCurrency(totalPending)}
              </Badge>
            </HStack>
            <Button
              leftIcon={<Icon as={FiDollarSign} />}
              colorScheme="green"
              size="sm"
              onClick={() => onReceivePayment(customer)}
            >
              {es.sales.receiveInstallment}
            </Button>
          </HStack>
        </VStack>
      </Box>
    );

  return (
    <VStack align="stretch" spacing={4}>
      {pendingSection}

      <Box bg="gray.50" p={4} borderRadius="lg" border="1px solid" borderColor="gray.200">
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between" align="center">
            <Text fontWeight="semibold" color="gray.700">
              Transacciones recientes ({filteredHistoryTransactions.length})
            </Text>
            {isLoadingLatest && (
              <HStack spacing={2}>
                <Spinner size="xs" color="blue.500" />
                <Text fontSize="xs" color="gray.500">
                  Actualizando...
                </Text>
              </HStack>
            )}
          </HStack>

          <HStack spacing={2}>
            <Button
              size="xs"
              colorScheme={historyFilter === 'sale' ? 'blue' : 'gray'}
              variant={historyFilter === 'sale' ? 'solid' : 'outline'}
              onClick={() => handleHistoryFilterChange('sale')}
            >
              Ventas
            </Button>
            <Button
              size="xs"
              colorScheme={historyFilter === 'return' ? 'orange' : 'gray'}
              variant={historyFilter === 'return' ? 'solid' : 'outline'}
              onClick={() => handleHistoryFilterChange('return')}
            >
              Devoluciones
            </Button>
            <Button
              size="xs"
              colorScheme={historyFilter === 'all' ? 'purple' : 'gray'}
              variant={historyFilter === 'all' ? 'solid' : 'outline'}
              onClick={() => handleHistoryFilterChange('all')}
            >
              Todas
            </Button>
          </HStack>

          {latestError && (
            <Alert status="warning" borderRadius="md" fontSize="sm">
              <AlertIcon />
              {latestError}
            </Alert>
          )}

          {filteredHistoryTransactions.length === 0 ? (
            <Box bg="white" p={3} borderRadius="md">
              <Text fontSize="sm" color="gray.600">
                {historyFilter === 'sale'
                  ? 'No hay ventas registradas para este cliente.'
                  : historyFilter === 'return'
                    ? 'No hay devoluciones registradas para este cliente.'
                    : 'No hay transacciones registradas para este cliente.'}
              </Text>
            </Box>
          ) : (
            <VStack align="stretch" spacing={3}>
              {visibleTransactions.map((transaction) => (
                <Box
                  key={transaction.id}
                  bg="white"
                  p={3}
                  borderRadius="md"
                  border="1px solid"
                  borderColor="gray.200"
                >
                  <VStack align="stretch" spacing={2}>
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={0}>
                        <Text fontSize="sm" color="gray.600">
                          {formatDateTime(transaction.date)}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          ID: {transaction.id}
                        </Text>
                      </VStack>
                      <HStack spacing={2}>
                        <Badge colorScheme="blue" variant="subtle">
                          {transactionTypeLabel[transaction.type]}
                        </Badge>
                        <Badge colorScheme={paymentMethodColor[transaction.paymentMethod]}>
                          {paymentMethodLabel[transaction.paymentMethod]}
                        </Badge>
                        <IconButton
                          aria-label="Descargar Excel"
                          icon={<Icon as={FiDownload} />}
                          size="xs"
                          variant="ghost"
                          colorScheme="teal"
                          onClick={() => handleExportTransaction(transaction)}
                        />
                        {transaction.type === 'sale' && (
                          <IconButton
                            aria-label={es.actions.modify}
                            icon={<Icon as={FiEdit2} />}
                            size="xs"
                            variant="ghost"
                            colorScheme="brand"
                            onClick={() => setTransactionToEdit(transaction)}
                          />
                        )}
                        {transaction.type === 'sale' && (
                          <IconButton
                            aria-label={es.actions.undo}
                            icon={<Icon as={FiRotateCcw} />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => handleUndoClick(transaction)}
                          />
                        )}
                      </HStack>
                    </HStack>

                    {transaction.items.length > 0 ? (
                      <VStack align="stretch" spacing={1}>
                        {transaction.items.map((item, index) => (
                          <HStack
                            key={`${transaction.id}-${item.productId}-${index}`}
                            justify="space-between"
                            fontSize="sm"
                            align="start"
                          >
                            <Text flex={1}>{item.productName}</Text>
                            <Text color="gray.500" whiteSpace="nowrap">
                              {item.quantity} x {formatCurrency(item.unitPrice)}
                            </Text>
                            <Text fontWeight="medium" whiteSpace="nowrap">
                              {formatCurrency(item.totalPrice)}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    ) : (
                      <Text fontSize="sm" color="gray.500">
                        Sin detalle de articulos.
                      </Text>
                    )}

                    <Divider borderColor="gray.200" />

                    <HStack justify="space-between" fontSize="sm">
                      <Text color="gray.500">Total</Text>
                      <Text fontWeight="bold">{formatCurrency(transaction.total)}</Text>
                    </HStack>

                    {(transaction.cashAmount > 0 ||
                      transaction.transferAmount > 0 ||
                      transaction.cardAmount > 0) && (
                      <HStack spacing={3} flexWrap="wrap">
                        {transaction.cashAmount > 0 && (
                          <Badge colorScheme="green" variant="outline">
                            Efectivo: {formatCurrency(transaction.cashAmount)}
                          </Badge>
                        )}
                        {transaction.transferAmount > 0 && (
                          <Badge colorScheme="blue" variant="outline">
                            Transferencia: {formatCurrency(transaction.transferAmount)}
                          </Badge>
                        )}
                        {transaction.cardAmount > 0 && (
                          <Badge colorScheme="purple" variant="outline">
                            Tarjeta: {formatCurrency(transaction.cardAmount)}
                          </Badge>
                        )}
                      </HStack>
                    )}

                    {transaction.notes && (
                      <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        {transaction.notes}
                      </Text>
                    )}
                  </VStack>
                </Box>
              ))}

              {canLoadMore && (
                <Button
                  alignSelf="center"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  {es.transactions.loadMoreTransactions}
                </Button>
              )}
            </VStack>
          )}
        </VStack>
      </Box>

      <EditSaleTransactionModal
        transaction={transactionToEdit}
        isOpen={!!transactionToEdit}
        onClose={() => setTransactionToEdit(null)}
        onSaved={(updatedTransaction) => {
          setLatestTransactions((current) => {
            const merged = mergeTransactions([updatedTransaction], current);
            return getLatestTransactionsForCustomer(merged, customer.id, customer.name);
          });
          setVisibleCount(PAGE_SIZE);
        }}
      />

      <ConfirmDialog
        isOpen={isUndoConfirmOpen}
        onClose={() => {
          if (isUndoing) return;
          onUndoConfirmClose();
          setTransactionToUndo(null);
        }}
        onConfirm={handleConfirmUndo}
        title={es.transactions.undoConfirmTitle}
        message={es.transactions.undoConfirmMessage}
        confirmText={es.actions.undo}
        cancelText={es.actions.cancel}
        colorScheme="red"
        isLoading={isUndoing}
      />
    </VStack>
  );
}
