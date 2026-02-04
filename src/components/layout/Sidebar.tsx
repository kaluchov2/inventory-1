import {
  Box,
  VStack,
  Icon,
  Text,
  Flex,
  Divider,
  Avatar,
  Button,
} from '@chakra-ui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FiHome,
  FiPackage,
  FiUsers,
  FiShoppingCart,
  FiBarChart2,
  FiSettings,
  FiLogOut,
  FiCamera,
  FiGrid,
} from 'react-icons/fi';
import { es } from '../../i18n/es';
import { useAuthStore } from '../../store/authStore';
import { SyncStatus } from '../common/SyncStatus';

interface NavItem {
  icon: typeof FiHome;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: FiHome, label: es.nav.home, path: '/' },
  { icon: FiPackage, label: es.nav.products, path: '/productos' },
  { icon: FiUsers, label: es.nav.customers, path: '/clientes' },
  { icon: FiShoppingCart, label: es.nav.sales, path: '/ventas' },
  { icon: FiCamera, label: es.nav.scanner, path: '/escaner' },
  { icon: FiGrid, label: es.nav.qrGenerator, path: '/codigos' },
  { icon: FiBarChart2, label: es.nav.reports, path: '/reportes' },
  { icon: FiSettings, label: es.nav.settings, path: '/configuracion' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Box
      as="nav"
      w="280px"
      minH="100vh"
      bg="white"
      borderRight="1px"
      borderColor="gray.200"
      py={6}
      position="fixed"
      left={0}
      top={0}
      display={{ base: 'none', lg: 'block' }}
    >
      {/* Logo/Title */}
      <Flex px={6} pb={6} alignItems="center">
        <Text fontSize="2xl" fontWeight="bold" color="brand.500">
          Inventario
        </Text>
      </Flex>

      <Divider mb={4} />

      {/* Navigation Items */}
      <VStack spacing={2} px={4} align="stretch" flex={1}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Flex
              key={item.path}
              alignItems="center"
              px={4}
              py={4}
              cursor="pointer"
              borderRadius="lg"
              bg={isActive ? 'brand.50' : 'transparent'}
              color={isActive ? 'brand.600' : 'gray.600'}
              fontWeight={isActive ? 'bold' : 'medium'}
              _hover={{
                bg: isActive ? 'brand.50' : 'gray.100',
                color: isActive ? 'brand.600' : 'gray.800',
              }}
              transition="all 0.2s"
              onClick={() => navigate(item.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(item.path);
                }
              }}
            >
              <Icon as={item.icon} boxSize={6} mr={4} />
              <Text fontSize="lg">{item.label}</Text>
            </Flex>
          );
        })}
      </VStack>

      {/* User Info & Logout at bottom */}
      <Box px={4} mt="auto">
        <Divider mb={4} />

        {/* Sync Status */}
        <Flex justifyContent="center" mb={3}>
          <SyncStatus />
        </Flex>

        {/* User Info */}
        {user && (
          <Flex alignItems="center" px={4} py={3} mb={2}>
            <Avatar
              size="sm"
              name={user.displayName || user.email}
              bg="brand.500"
              color="white"
              mr={3}
            />
            <Box flex={1} minW={0}>
              <Text fontWeight="medium" fontSize="sm" noOfLines={1}>
                {user.displayName || 'Usuario'}
              </Text>
              <Text fontSize="xs" color="gray.500" noOfLines={1}>
                {user.email}
              </Text>
            </Box>
          </Flex>
        )}

        {/* Logout Button */}
        <Button
          leftIcon={<Icon as={FiLogOut} />}
          variant="ghost"
          colorScheme="red"
          w="full"
          justifyContent="flex-start"
          onClick={handleLogout}
        >
          Cerrar Sesión
        </Button>
      </Box>
    </Box>
  );
}
