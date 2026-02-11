import { useMemo } from 'react';
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
} from '@chakra-ui/react';
import { FiDollarSign } from 'react-icons/fi';
import { Customer } from '../../types';
import { useTransactionStore } from '../../store/transactionStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { es } from '../../i18n/es';

interface CustomerTransactionDetailsProps {
  customer: Customer;
  onReceivePayment: (customer: Customer) => void;
}

export function CustomerTransactionDetails({
  customer,
  onReceivePayment,
}: CustomerTransactionDetailsProps) {
  const { getUnpaidTransactionsByCustomer, getEffectivePendingMap } = useTransactionStore();

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

  if (customer.balance > 0 && unpaidTransactions.length === 0) {
    return (
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
    );
  }

  if (unpaidTransactions.length === 0) {
    return (
      <Box bg="green.50" p={4} borderRadius="lg">
        <Text fontSize="sm" color="green.700" fontWeight="medium">
          Sin transacciones pendientes
        </Text>
      </Box>
    );
  }

  return (
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
                {/* Header: Date + Pending Badge */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.600">
                    {formatDate(transaction.date)}
                  </Text>
                  <Badge colorScheme="orange" fontSize="sm">
                    Debe: {formatCurrency(pending)}
                  </Badge>
                </HStack>

                {/* Items List */}
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

                {/* Totals */}
                <HStack justify="space-between" fontSize="sm">
                  <Text color="gray.500">Total</Text>
                  <Text fontWeight="bold">
                    {formatCurrency(transaction.total)}
                  </Text>
                </HStack>
                <HStack justify="space-between" fontSize="sm">
                  <Text color="gray.500">Pagado</Text>
                  <Text color="green.600">{formatCurrency(totalPaid)}</Text>
                </HStack>

                {/* Payment Breakdown Badges */}
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

                {/* Notes */}
                {transaction.notes && (
                  <Text fontSize="sm" fontStyle="italic" color="gray.500">
                    {transaction.notes}
                  </Text>
                )}
              </VStack>
            </Box>
          );
        })}

        {/* Summary Footer */}
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
}
