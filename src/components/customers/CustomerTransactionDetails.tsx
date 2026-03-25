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
  Alert,
  AlertIcon,
  Spinner,
} from '@chakra-ui/react';
import { FiDollarSign } from 'react-icons/fi';
import { Customer, Transaction } from '../../types';
import { useTransactionStore } from '../../store/transactionStore';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { es } from '../../i18n/es';
import { transactionService } from '../../services/transactionService';

interface CustomerTransactionDetailsProps {
  customer: Customer;
  onReceivePayment: (customer: Customer) => void;
}

const LATEST_LIMIT = 10;

const normalizeCustomerKey = (value: string | undefined | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const mergeTransactions = (remote: Transaction[], local: Transaction[]) => {
  const merged = new Map<string, Transaction>();
  remote.forEach((tx) => merged.set(tx.id, tx));
  local.forEach((tx) => merged.set(tx.id, tx));
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
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, LATEST_LIMIT);
}

export function CustomerTransactionDetails({
  customer,
  onReceivePayment,
}: CustomerTransactionDetailsProps) {
  const { transactions, getUnpaidTransactionsByCustomer, getEffectivePendingMap } =
    useTransactionStore();

  const [latestTransactions, setLatestTransactions] = useState<Transaction[]>([]);
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);

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

  useEffect(() => {
    setLatestTransactions(
      getLatestTransactionsForCustomer(transactions, customer.id, customer.name)
    );
  }, [customer.id, customer.name, transactions]);

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
      } catch (error) {
        console.warn(
          '[CustomerTransactionDetails] Remote query failed, using local cache:',
          error
        );
        if (!isMounted) return;
        setLatestError('No se pudo completar consulta remota. Mostrando cache local.');
      } finally {
        if (isMounted) setIsLoadingLatest(false);
      }
    };

    loadLatestTransactions();

    return () => {
      isMounted = false;
    };
  }, [customer.id, customer.name]);

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
              Ultimas {LATEST_LIMIT} transacciones
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

          {latestError && (
            <Alert status="warning" borderRadius="md" fontSize="sm">
              <AlertIcon />
              {latestError}
            </Alert>
          )}

          {latestTransactions.length === 0 ? (
            <Box bg="white" p={3} borderRadius="md">
              <Text fontSize="sm" color="gray.600">
                No hay transacciones registradas para este cliente.
              </Text>
            </Box>
          ) : (
            <VStack align="stretch" spacing={3}>
              {latestTransactions.map((transaction) => (
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
            </VStack>
          )}
        </VStack>
      </Box>
    </VStack>
  );
}
