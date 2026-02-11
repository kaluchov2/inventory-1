import { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  SimpleGrid,
  Divider,
} from '@chakra-ui/react';
import { Product } from '../../types';
import { useCustomerStore } from '../../store/customerStore';
import { useTransactionStore } from '../../store/transactionStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { es } from '../../i18n/es';

interface SoldProductDetailsProps {
  product: Product;
}

export function SoldProductDetails({ product }: SoldProductDetailsProps) {
  const { customers } = useCustomerStore();
  const { transactions, getEffectivePendingMap } = useTransactionStore();

  // Find the customer if soldTo is set
  const customer = useMemo(() => {
    if (!product.soldTo) return null;
    return customers.find((c) => c.id === product.soldTo);
  }, [customers, product.soldTo]);

  // Find related transaction
  const relatedTransaction = useMemo(() => {
    return transactions.find(
      (t) =>
        t.type === 'sale' &&
        t.items.some((item) => item.productId === product.id)
    );
  }, [transactions, product.id]);

  // Get the item from the transaction
  const transactionItem = useMemo(() => {
    if (!relatedTransaction) return null;
    return relatedTransaction.items.find((item) => item.productId === product.id);
  }, [relatedTransaction, product.id]);

  // Calculate payment status accounting for installment payments
  const paymentStatus = useMemo(() => {
    if (!relatedTransaction) return { status: 'unknown', amount: 0 };

    const originalPaid =
      relatedTransaction.cashAmount +
      relatedTransaction.transferAmount +
      relatedTransaction.cardAmount;

    if (originalPaid >= relatedTransaction.total) {
      return { status: 'paid', amount: 0 };
    }

    // Check effective pending if customer has installment payments
    if (relatedTransaction.customerId) {
      const pendingMap = getEffectivePendingMap(relatedTransaction.customerId);
      const effectivePending = pendingMap.get(relatedTransaction.id);
      if (effectivePending !== undefined) {
        if (effectivePending <= 0.01) return { status: 'paid', amount: 0 };
        return { status: 'pending', amount: effectivePending };
      }
    }

    return { status: 'pending', amount: relatedTransaction.total - originalPaid };
  }, [relatedTransaction, getEffectivePendingMap]);

  return (
    <Box bg="blue.50" p={4} borderRadius="lg">
      <VStack align="stretch" spacing={3}>
        {/* Sale Info Header */}
        <HStack justify="space-between" align="start">
          <Text fontWeight="semibold" color="blue.700">
            Detalles de Venta
          </Text>
          <Badge
            colorScheme={paymentStatus.status === 'paid' ? 'green' : 'orange'}
            fontSize="sm"
          >
            {paymentStatus.status === 'paid'
              ? 'Pagado'
              : `Debe: ${formatCurrency(paymentStatus.amount)}`}
          </Badge>
        </HStack>

        <Divider borderColor="blue.200" />

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
          {/* Customer Info */}
          <Box>
            <Text fontSize="xs" color="gray.500" fontWeight="semibold">
              Cliente
            </Text>
            <Text fontSize="sm">
              {customer?.name || es.customers.walkIn}
            </Text>
            {customer && customer.balance > 0 && (
              <Badge colorScheme="orange" fontSize="xs" mt={1}>
                Saldo Total: {formatCurrency(customer.balance)}
              </Badge>
            )}
          </Box>

          {/* Sale Date */}
          <Box>
            <Text fontSize="xs" color="gray.500" fontWeight="semibold">
              Fecha de Venta
            </Text>
            <Text fontSize="sm">
              {product.soldAt ? formatDate(product.soldAt) : '-'}
            </Text>
          </Box>

          {/* Quantity Sold */}
          {transactionItem && (
            <Box>
              <Text fontSize="xs" color="gray.500" fontWeight="semibold">
                Cantidad Vendida
              </Text>
              <Text fontSize="sm">{transactionItem.quantity} unidades</Text>
            </Box>
          )}

          {/* Sale Amount */}
          {transactionItem && (
            <Box>
              <Text fontSize="xs" color="gray.500" fontWeight="semibold">
                Monto de Venta
              </Text>
              <Text fontSize="sm" fontWeight="bold" color="green.600">
                {formatCurrency(transactionItem.totalPrice)}
              </Text>
            </Box>
          )}
        </SimpleGrid>

        {/* Payment Breakdown */}
        {relatedTransaction && (
          <>
            <Divider borderColor="blue.200" />
            <Box>
              <Text fontSize="xs" color="gray.500" fontWeight="semibold" mb={2}>
                Desglose de Pago
              </Text>
              <HStack spacing={4} flexWrap="wrap">
                {relatedTransaction.cashAmount > 0 && (
                  <HStack>
                    <Badge colorScheme="green" variant="outline">
                      Efectivo
                    </Badge>
                    <Text fontSize="sm">
                      {formatCurrency(relatedTransaction.cashAmount)}
                    </Text>
                  </HStack>
                )}
                {relatedTransaction.transferAmount > 0 && (
                  <HStack>
                    <Badge colorScheme="blue" variant="outline">
                      Transferencia
                    </Badge>
                    <Text fontSize="sm">
                      {formatCurrency(relatedTransaction.transferAmount)}
                    </Text>
                  </HStack>
                )}
                {relatedTransaction.cardAmount > 0 && (
                  <HStack>
                    <Badge colorScheme="purple" variant="outline">
                      Tarjeta
                    </Badge>
                    <Text fontSize="sm">
                      {formatCurrency(relatedTransaction.cardAmount)}
                    </Text>
                  </HStack>
                )}
              </HStack>
            </Box>
          </>
        )}

        {/* Notes */}
        {relatedTransaction?.notes && (
          <>
            <Divider borderColor="blue.200" />
            <Box>
              <Text fontSize="xs" color="gray.500" fontWeight="semibold">
                Notas
              </Text>
              <Text fontSize="sm" fontStyle="italic">
                {relatedTransaction.notes}
              </Text>
            </Box>
          </>
        )}
      </VStack>
    </Box>
  );
}
