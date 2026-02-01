import {
  Box,
  Heading,
  SimpleGrid,
  VStack,
  HStack,
  Button,
  Icon,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import {
  FiShoppingCart,
  FiPackage,
  FiDollarSign,
  FiUsers,
  FiAlertTriangle,
  FiClipboard,
} from 'react-icons/fi';
import { StatCard } from '../components/common';
import { useProductStore } from '../store/productStore';
import { useCustomerStore } from '../store/customerStore';
import { useTransactionStore } from '../store/transactionStore';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { es } from '../i18n/es';

export function Home() {
  const navigate = useNavigate();

  const { products, getTotalInventoryValue, getLowStockProducts } = useProductStore();
  const { getTotalOutstandingBalance } = useCustomerStore();
  const { transactions, getTodaySales } = useTransactionStore();

  const totalProducts = products.filter(p => p.status === 'available').length;
  const inventoryValue = getTotalInventoryValue();
  const lowStockProducts = getLowStockProducts();
  const todaySales = getTodaySales();
  const outstandingBalance = getTotalOutstandingBalance();

  // Get recent transactions (last 5)
  const recentTransactions = transactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const quickActions = [
    {
      label: es.sales.registerSale,
      icon: FiShoppingCart,
      color: 'green',
      path: '/ventas?action=new',
    },
    {
      label: es.products.addProduct,
      icon: FiPackage,
      color: 'brand',
      path: '/productos?action=new',
    },
    {
      label: es.sales.receiveInstallment,
      icon: FiDollarSign,
      color: 'orange',
      path: '/ventas?action=installment',
    },
    {
      label: es.nav.products,
      icon: FiClipboard,
      color: 'gray',
      path: '/productos',
    },
  ];

  return (
    <VStack spacing={{ base: 4, md: 6, lg: 8 }} align="stretch">
      {/* Page Title */}
      <Heading size={{ base: 'lg', md: 'xl' }} color="gray.800">
        {es.dashboard.title}
      </Heading>

      {/* Summary Stats */}
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
        <StatCard
          title={es.dashboard.totalProducts}
          value={totalProducts.toLocaleString()}
          icon={FiPackage}
          colorScheme="brand"
        />
        <StatCard
          title={es.dashboard.inventoryValue}
          value={formatCurrency(inventoryValue)}
          icon={FiDollarSign}
          colorScheme="success"
        />
        <StatCard
          title={es.dashboard.lowStockCount}
          value={lowStockProducts.length}
          icon={FiAlertTriangle}
          colorScheme={lowStockProducts.length > 0 ? 'warning' : 'brand'}
        />
        <StatCard
          title={es.dashboard.outstandingBalance}
          value={formatCurrency(outstandingBalance)}
          icon={FiUsers}
          colorScheme={outstandingBalance > 0 ? 'danger' : 'success'}
        />
      </SimpleGrid>

      {/* Today's Sales Summary */}
      <Box bg="white" borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="sm">
        <Heading size={{ base: 'md', md: 'lg' }} mb={4}>
          {es.dashboard.todaysSales}
        </Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 2, md: 4 }}>
          <Box p={4} bg="green.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Efectivo</Text>
            <Text fontSize="2xl" fontWeight="bold" color="green.600">
              {formatCurrency(todaySales.cash)}
            </Text>
          </Box>
          <Box p={4} bg="blue.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Transferencia</Text>
            <Text fontSize="2xl" fontWeight="bold" color="blue.600">
              {formatCurrency(todaySales.transfer)}
            </Text>
          </Box>
          <Box p={4} bg="purple.50" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Tarjeta</Text>
            <Text fontSize="2xl" fontWeight="bold" color="purple.600">
              {formatCurrency(todaySales.card)}
            </Text>
          </Box>
          <Box p={4} bg="gray.100" borderRadius="lg" textAlign="center">
            <Text fontSize="md" color="gray.600">Total</Text>
            <Text fontSize="2xl" fontWeight="bold" color="gray.800">
              {formatCurrency(todaySales.total)}
            </Text>
          </Box>
        </SimpleGrid>
      </Box>

      {/* Quick Actions */}
      <Box bg="white" borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="sm">
        <Heading size={{ base: 'md', md: 'lg' }} mb={{ base: 4, md: 6 }}>
          {es.dashboard.quickActions}
        </Heading>
        <SimpleGrid columns={{ base: 2, md: 2, lg: 4 }} spacing={{ base: 2, md: 4 }}>
          {quickActions.map((action) => (
            <Button
              key={action.path}
              size={{ base: 'md', md: 'lg' }}
              h={{ base: '70px', md: '80px' }}
              colorScheme={action.color}
              leftIcon={<Icon as={action.icon} boxSize={{ base: 5, md: 6 }} />}
              onClick={() => navigate(action.path)}
              fontSize={{ base: 'sm', md: 'lg' }}
              px={{ base: 2, md: 4 }}
              whiteSpace="normal"
              textAlign="center"
            >
              {action.label}
            </Button>
          ))}
        </SimpleGrid>
      </Box>

      {/* Recent Transactions */}
      <Box bg="white" borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="sm">
        <HStack justify="space-between" mb={4} flexWrap="wrap" gap={2}>
          <Heading size={{ base: 'md', md: 'lg' }}>
            {es.dashboard.recentTransactions}
          </Heading>
          <Button
            variant="link"
            colorScheme="brand"
            onClick={() => navigate('/reportes')}
          >
            Ver todos
          </Button>
        </HStack>

        {recentTransactions.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={8}>
            {es.transactions.noTransactions}
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>{es.transactions.date}</Th>
                  <Th>{es.transactions.customer}</Th>
                  <Th isNumeric>{es.transactions.amount}</Th>
                  <Th>{es.transactions.paymentMethod}</Th>
                  <Th>{es.transactions.type}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {recentTransactions.map((transaction) => (
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
                    <Td>
                      <Badge colorScheme="gray">
                        {transaction.type === 'sale' ? 'Venta' :
                         transaction.type === 'return' ? 'Devolución' :
                         transaction.type === 'installment_payment' ? 'Abono' : 'Ajuste'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Box>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Box bg="orange.50" borderRadius="xl" p={{ base: 4, md: 6 }} border="2px" borderColor="orange.200">
          <HStack spacing={3} mb={4} flexWrap="wrap">
            <Icon as={FiAlertTriangle} boxSize={{ base: 5, md: 6 }} color="orange.500" />
            <Heading size={{ base: 'md', md: 'lg' }} color="orange.700">
              {es.reports.lowStockItems}
            </Heading>
          </HStack>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
            {lowStockProducts.slice(0, 6).map((product) => (
              <Box
                key={product.id}
                p={3}
                bg="white"
                borderRadius="lg"
                border="1px"
                borderColor="orange.200"
              >
                <Text fontWeight="bold" noOfLines={1}>{product.name}</Text>
                <HStack justify="space-between">
                  <Text color="gray.600">Cantidad: {product.quantity}</Text>
                  <Badge colorScheme="orange">Stock Bajo</Badge>
                </HStack>
              </Box>
            ))}
          </SimpleGrid>
          {lowStockProducts.length > 6 && (
            <Button
              variant="link"
              colorScheme="orange"
              mt={4}
              onClick={() => navigate('/productos?filter=low-stock')}
            >
              Ver todos ({lowStockProducts.length} productos)
            </Button>
          )}
        </Box>
      )}
    </VStack>
  );
}
