import { useMemo, useState } from 'react';
import {
  Box,
  Heading,
  VStack,
  SimpleGrid,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  HStack,
  Select,
  Icon,
} from '@chakra-ui/react';
import { FiCalendar } from 'react-icons/fi';
import { StatCard } from '../components/common';
import { useProductStore } from '../store/productStore';
import { useCustomerStore } from '../store/customerStore';
import { useTransactionStore } from '../store/transactionStore';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { getCategoryLabel } from '../constants/categories';
import { es } from '../i18n/es';

export function Reports() {
  const [dateRange, setDateRange] = useState('today');

  const { getTotalInventoryValue, getLowStockProducts } = useProductStore();
  const { getTotalOutstandingBalance, getCustomersWithBalance } = useCustomerStore();
  const { transactions, getTotalSalesByCategory } = useTransactionStore();

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    let fromDate: string;
    switch (dateRange) {
      case 'today':
        fromDate = today;
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        fromDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        fromDate = monthAgo.toISOString().split('T')[0];
        break;
      default:
        fromDate = today;
    }
    return { from: fromDate, to: today + 'T23:59:59' };
  };

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    const { from, to } = getDateRange();
    return transactions
      .filter(t => t.type === 'sale' && t.date >= from && t.date <= to)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, dateRange]);

  // Calculate stats
  const totalSales = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
  const cashSales = filteredTransactions.reduce((sum, t) => sum + t.cashAmount, 0);
  const transferSales = filteredTransactions.reduce((sum, t) => sum + t.transferAmount, 0);
  const cardSales = filteredTransactions.reduce((sum, t) => sum + t.cardAmount, 0);

  const inventoryValue = getTotalInventoryValue();
  const lowStockProducts = getLowStockProducts();
  const outstandingBalance = getTotalOutstandingBalance();
  const customersWithBalance = getCustomersWithBalance();
  const salesByCategory = getTotalSalesByCategory();

  // Top products
  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; quantity: number; total: number }> = {};

    filteredTransactions.forEach(t => {
      t.items.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = { name: item.productName, quantity: 0, total: 0 };
        }
        productSales[item.productId].quantity += item.quantity;
        productSales[item.productId].total += item.totalPrice;
      });
    });

    return Object.values(productSales)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredTransactions]);

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      {/* Header */}
      <HStack justify="space-between" wrap="wrap" gap={3}>
        <Heading size={{ base: 'lg', md: 'xl' }}>{es.reports.title}</Heading>
        <HStack>
          <Icon as={FiCalendar} display={{ base: 'none', sm: 'block' }} />
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            w={{ base: '150px', md: '200px' }}
            bg="white"
            size={{ base: 'sm', md: 'md' }}
          >
            <option value="today">Hoy</option>
            <option value="week">Última Semana</option>
            <option value="month">Último Mes</option>
          </Select>
        </HStack>
      </HStack>

      {/* Summary Stats */}
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
        <StatCard
          title="Ventas del Período"
          value={formatCurrency(totalSales)}
          colorScheme="success"
        />
        <StatCard
          title={es.reports.totalInventoryValue}
          value={formatCurrency(inventoryValue)}
          colorScheme="brand"
        />
        <StatCard
          title={es.reports.lowStockItems}
          value={lowStockProducts.length.toString()}
          colorScheme={lowStockProducts.length > 0 ? 'warning' : 'brand'}
        />
        <StatCard
          title={es.reports.outstandingBalances}
          value={formatCurrency(outstandingBalance)}
          colorScheme={outstandingBalance > 0 ? 'danger' : 'success'}
        />
      </SimpleGrid>

      {/* Payment Breakdown */}
      <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
        <Heading size="md" mb={4}>{es.reports.salesByPaymentMethod}</Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <Box p={4} bg="green.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Efectivo</Text>
            <Text fontSize="2xl" fontWeight="bold" color="green.600">
              {formatCurrency(cashSales)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {totalSales > 0 ? Math.round((cashSales / totalSales) * 100) : 0}%
            </Text>
          </Box>
          <Box p={4} bg="blue.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Transferencia</Text>
            <Text fontSize="2xl" fontWeight="bold" color="blue.600">
              {formatCurrency(transferSales)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {totalSales > 0 ? Math.round((transferSales / totalSales) * 100) : 0}%
            </Text>
          </Box>
          <Box p={4} bg="purple.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Tarjeta</Text>
            <Text fontSize="2xl" fontWeight="bold" color="purple.600">
              {formatCurrency(cardSales)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {totalSales > 0 ? Math.round((cardSales / totalSales) * 100) : 0}%
            </Text>
          </Box>
        </SimpleGrid>
      </Box>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Top Products */}
        <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
          <Heading size="md" mb={4}>{es.reports.topProducts}</Heading>
          {topProducts.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={4}>
              No hay ventas en este período
            </Text>
          ) : (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Producto</Th>
                  <Th isNumeric>Cant.</Th>
                  <Th isNumeric>Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {topProducts.map((product, index) => (
                  <Tr key={index}>
                    <Td>
                      <Text noOfLines={1}>{product.name}</Text>
                    </Td>
                    <Td isNumeric>{product.quantity}</Td>
                    <Td isNumeric fontWeight="medium">
                      {formatCurrency(product.total)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>

        {/* Outstanding Balances */}
        <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
          <Heading size="md" mb={4}>{es.reports.outstandingBalances}</Heading>
          {customersWithBalance.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={4}>
              No hay saldos pendientes
            </Text>
          ) : (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Cliente</Th>
                  <Th isNumeric>Saldo</Th>
                </Tr>
              </Thead>
              <Tbody>
                {customersWithBalance.slice(0, 10).map((customer) => (
                  <Tr key={customer.id}>
                    <Td fontWeight="medium">{customer.name}</Td>
                    <Td isNumeric>
                      <Badge colorScheme="red" fontSize="sm" px={2}>
                        {formatCurrency(customer.balance)}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>
      </SimpleGrid>

      {/* Sales by Category */}
      <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
        <Heading size="md" mb={4}>{es.reports.salesByCategory}</Heading>
        <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} spacing={3}>
          {Object.entries(salesByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([category, total]) => (
              <Box
                key={category}
                p={3}
                bg="gray.50"
                borderRadius="lg"
                textAlign="center"
              >
                <Badge colorScheme="purple" mb={2}>
                  {getCategoryLabel(category as any) || category}
                </Badge>
                <Text fontWeight="bold">{formatCurrency(total)}</Text>
              </Box>
            ))}
        </SimpleGrid>
      </Box>

      {/* Recent Transactions */}
      <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
        <Heading size="md" mb={4}>Transacciones del Período</Heading>
        {filteredTransactions.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={4}>
            No hay transacciones en este período
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>{es.transactions.date}</Th>
                  <Th>{es.transactions.customer}</Th>
                  <Th isNumeric>{es.transactions.amount}</Th>
                  <Th>{es.transactions.paymentMethod}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredTransactions.slice(0, 20).map((transaction) => (
                  <Tr key={transaction.id}>
                    <Td>{formatDateTime(transaction.date)}</Td>
                    <Td fontWeight="medium">{transaction.customerName}</Td>
                    <Td isNumeric fontWeight="bold" color="green.600">
                      {formatCurrency(transaction.total)}
                    </Td>
                    <Td>
                      <Badge
                        colorScheme={
                          transaction.paymentMethod === 'cash' ? 'green' :
                          transaction.paymentMethod === 'transfer' ? 'blue' :
                          transaction.paymentMethod === 'card' ? 'purple' : 'gray'
                        }
                      >
                        {transaction.paymentMethod === 'cash' ? 'Efectivo' :
                         transaction.paymentMethod === 'transfer' ? 'Transferencia' :
                         transaction.paymentMethod === 'card' ? 'Tarjeta' :
                         transaction.paymentMethod === 'mixed' ? 'Mixto' : 'Crédito'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Box>
    </VStack>
  );
}
