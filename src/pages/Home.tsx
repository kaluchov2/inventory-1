import {
  Box,
  Heading,
  SimpleGrid,
  VStack,
  HStack,
  Button,
  Icon,
  Text,
  Select,
  Badge,
} from '@chakra-ui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiShoppingCart,
  FiPackage,
  FiDollarSign,
  FiUsers,
  FiAlertCircle,
  FiClipboard,
  FiStar,
  FiCheckCircle,
} from 'react-icons/fi';
import { StatCard } from '../components/common';
import { useProductStore } from '../store/productStore';
import { useCustomerStore } from '../store/customerStore';
import { formatCurrency } from '../utils/formatters';
import { es } from '../i18n/es';
import { getReviewQty } from '../utils/productHelpers';
import { UPS_BATCH_OPTIONS } from '../constants/colors';

const whatsNewItems = [
  'Mejoras en sincronizacion de ventas y productos',
  'Correcciones de errores en flujo de ventas',
  'Nueva seccion de ayuda en Soporte',
  'Validacion de ventas por cliente y fecha en Transacciones',
  'Soporte para Cliente de Paso en validacion y exportes',
  'Impresion de QR disponible desde Productos',
];

export function Home() {
  const navigate = useNavigate();
  const [selectedUps, setSelectedUps] = useState<number | ''>('');

  const { products, getTotalInventoryValue } = useProductStore();
  const { getTotalOutstandingBalance } = useCustomerStore();

  const filteredProducts = selectedUps
    ? products.filter(p => Number(p.upsBatch) === selectedUps)
    : products;

  const totalProducts = filteredProducts.filter(p => p.availableQty > 0).length;
  const inventoryValue = selectedUps
    ? filteredProducts.filter(p => p.availableQty > 0)
        .reduce((sum, p) => sum + p.availableQty * p.unitPrice, 0)
    : getTotalInventoryValue();
  const reviewProducts = filteredProducts.filter(p => getReviewQty(p) > 0);
  const outstandingBalance = getTotalOutstandingBalance();

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

      {/* UPS Filter */}
      <HStack spacing={3} flexWrap="wrap">
        <Text fontWeight="medium" color="gray.600" whiteSpace="nowrap">Filtrar por UPS:</Text>
        <Select
          size="sm"
          w="160px"
          value={selectedUps}
          onChange={e => setSelectedUps(e.target.value ? Number(e.target.value) : '')}
          borderRadius="md"
        >
          <option value="">Todos</option>
          {UPS_BATCH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        {selectedUps !== '' && (
          <Button size="sm" variant="ghost" colorScheme="gray" onClick={() => setSelectedUps('')}>
            âœ• Limpiar
          </Button>
        )}
      </HStack>

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
          title="Por Revisar"
          value={reviewProducts.length}
          icon={FiAlertCircle}
          colorScheme={reviewProducts.length > 0 ? 'warning' : 'brand'}
        />
        <StatCard
          title={es.dashboard.outstandingBalance + (selectedUps !== '' ? ' (global)' : '')}
          value={formatCurrency(outstandingBalance)}
          icon={FiUsers}
          colorScheme={outstandingBalance > 0 ? 'danger' : 'success'}
        />
      </SimpleGrid>

      {/* What's New */}
      <Box bg="blue.50" borderRadius="xl" p={{ base: 4, md: 6 }} border="1px" borderColor="blue.100">
        <HStack spacing={2} mb={4} flexWrap="wrap">
          <Icon as={FiStar} color="blue.500" boxSize={5} />
          <Heading size="md" color="blue.700">Â¿QuÃ© hay de nuevo?</Heading>
          <Badge colorScheme="blue" fontSize="xs" borderRadius="full" px={2}>
            Ãšltima actualizaciÃ³n
          </Badge>
        </HStack>
        <VStack spacing={2} align="stretch">
          {whatsNewItems.map((item, i) => (
            <HStack key={i} spacing={2} align="flex-start">
              <Icon as={FiCheckCircle} color="blue.400" boxSize={4} mt="2px" flexShrink={0} />
              <Text fontSize="sm" color="blue.800">{item}</Text>
            </HStack>
          ))}
        </VStack>
        <Button
          mt={4}
          size="sm"
          colorScheme="blue"
          variant="outline"
          onClick={() => navigate('/soporte')}
        >
          Ver Preguntas Frecuentes
        </Button>
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
    </VStack>
  );
}
