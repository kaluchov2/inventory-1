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
  Button,
  Input,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { FiCalendar, FiDownload } from 'react-icons/fi';
import { StatCard } from '../components/common';
import { useProductStore } from '../store/productStore';
import { useCustomerStore } from '../store/customerStore';
import { useTransactionStore } from '../store/transactionStore';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { getCategoryLabel } from '../constants/categories';
import { es } from '../i18n/es';
import { buildMonthlySatSalesRows } from '../utils/satSalesReport';
import { exportSatSalesToExcel } from '../utils/excelExport';

export function Reports() {
  const toast = useToast();
  const [dateRange, setDateRange] = useState('today');
  const [satReportMonth, setSatReportMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );

  const { getTotalInventoryValue } = useProductStore();
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
      .filter(
        (t) =>
          (t.type === 'sale' || t.type === 'return') &&
          t.date >= from &&
          t.date <= to
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, dateRange]);

  // Calculate stats
  const totalSales = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
  const cashSales = filteredTransactions.reduce((sum, t) => sum + t.cashAmount, 0);
  const transferSales = filteredTransactions.reduce((sum, t) => sum + t.transferAmount, 0);
  const cardSales = filteredTransactions.reduce((sum, t) => sum + t.cardAmount, 0);
  const paymentVolume = Math.abs(cashSales) + Math.abs(transferSales) + Math.abs(cardSales);

  const inventoryValue = getTotalInventoryValue();
  const outstandingBalance = getTotalOutstandingBalance();
  const customersWithBalance = getCustomersWithBalance();
  const salesByCategory = getTotalSalesByCategory();
  const monthlySatRows = useMemo(
    () => buildMonthlySatSalesRows(transactions, satReportMonth),
    [transactions, satReportMonth],
  );
  const monthlySatMissingCount = monthlySatRows.filter(
    (row) => row.satStatus === 'Sin clave SAT',
  ).length;

  const handleExportMonthlySat = () => {
    if (monthlySatRows.length === 0) {
      toast({
        title: 'No hay ventas para exportar',
        description: 'Seleccione otro mes o registre ventas antes de descargar.',
        status: 'warning',
        duration: 3500,
        isClosable: true,
      });
      return;
    }
    exportSatSalesToExcel(monthlySatRows, satReportMonth);
    toast({
      title: 'Reporte SAT descargado',
      description: `${monthlySatRows.length} renglon(es) incluidos.`,
      status: 'success',
      duration: 3000,
    });
  };

  // Top products
  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; quantity: number; total: number }> = {};

    filteredTransactions.forEach((transaction) => {
      const direction = transaction.type === 'return' ? -1 : 1;
      transaction.items.forEach((item) => {
        const productKey = item.productId || `unregistered:${item.productName}:${item.unitPrice}`;
        if (!productSales[productKey]) {
          productSales[productKey] = { name: item.productName, quantity: 0, total: 0 };
        }
        productSales[productKey].quantity += item.quantity * direction;
        productSales[productKey].total += item.totalPrice * direction;
      });
    });

    return Object.values(productSales)
      .filter((product) => product.total > 0 || product.quantity > 0)
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
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
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
              {paymentVolume > 0 ? Math.round((Math.abs(cashSales) / paymentVolume) * 100) : 0}%
            </Text>
          </Box>
          <Box p={4} bg="blue.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Transferencia</Text>
            <Text fontSize="2xl" fontWeight="bold" color="blue.600">
              {formatCurrency(transferSales)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {paymentVolume > 0 ? Math.round((Math.abs(transferSales) / paymentVolume) * 100) : 0}%
            </Text>
          </Box>
          <Box p={4} bg="purple.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Tarjeta</Text>
            <Text fontSize="2xl" fontWeight="bold" color="purple.600">
              {formatCurrency(cardSales)}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {paymentVolume > 0 ? Math.round((Math.abs(cardSales) / paymentVolume) * 100) : 0}%
            </Text>
          </Box>
        </SimpleGrid>
      </Box>

      <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
        <Flex
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          gap={4}
          mb={4}
        >
          <Box>
            <Heading size="md">Ventas Mensuales SAT</Heading>
            <Text color="gray.500" mt={1}>
              {monthlySatRows.length} renglon(es), {monthlySatMissingCount} sin clave SAT
            </Text>
          </Box>
          <HStack spacing={3} flexWrap="wrap">
            <Input
              type="month"
              value={satReportMonth}
              onChange={(event) => setSatReportMonth(event.target.value)}
              maxW={{ base: 'full', md: '180px' }}
              bg="white"
            />
            <Button
              leftIcon={<Icon as={FiDownload} />}
              onClick={handleExportMonthlySat}
              isDisabled={monthlySatRows.length === 0}
            >
              Descargar Excel
            </Button>
          </HStack>
        </Flex>
        {monthlySatRows.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={4}>
            No hay ventas registradas en este mes.
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Fecha</Th>
                  <Th>Producto</Th>
                  <Th>Clave SAT</Th>
                  <Th>Pago</Th>
                  <Th isNumeric>Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {monthlySatRows.slice(0, 8).map((row, index) => (
                  <Tr key={`${row.saleDate}-${row.description}-${index}`}>
                    <Td>{row.saleDate}</Td>
                    <Td>
                      <Text noOfLines={1}>{row.description}</Text>
                    </Td>
                    <Td>
                      <Badge colorScheme={row.satStatus === 'Con clave' ? 'teal' : 'gray'}>
                        {row.satCode}
                      </Badge>
                    </Td>
                    <Td>{row.paymentMethod}</Td>
                    <Td isNumeric>{formatCurrency(row.lineTotal)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {monthlySatRows.length > 8 && (
              <Text color="gray.500" fontSize="sm" mt={3}>
                Se muestran 8 renglones. El Excel incluye todos.
              </Text>
            )}
          </Box>
        )}
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
                    <Td
                      isNumeric
                      fontWeight="bold"
                      color={transaction.total < 0 ? "orange.600" : "green.600"}
                    >
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
