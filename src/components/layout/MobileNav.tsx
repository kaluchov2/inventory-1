import {
  Box,
  Flex,
  IconButton,
  Text,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  DrawerFooter,
  VStack,
  Icon,
  Divider,
  Avatar,
  Button,
} from '@chakra-ui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FiMenu,
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

export function MobileNav() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    onClose();
    navigate('/login');
  };

  // Get current page title
  const currentPage = navItems.find(item => item.path === location.pathname);

  return (
    <>
      {/* Mobile Header Bar */}
      <Flex
        display={{ base: 'flex', lg: 'none' }}
        position="fixed"
        top={0}
        left={0}
        right={0}
        h="60px"
        bg="white"
        borderBottom="1px"
        borderColor="gray.200"
        alignItems="center"
        justifyContent="space-between"
        px={4}
        zIndex={100}
      >
        <Flex alignItems="center">
          <IconButton
            aria-label="Abrir menú"
            icon={<Icon as={FiMenu} boxSize={6} />}
            variant="ghost"
            size="lg"
            onClick={onOpen}
          />
          <Text fontSize="xl" fontWeight="bold" color="brand.500" ml={3}>
            {currentPage?.label || 'Inventario'}
          </Text>
        </Flex>

        {/* Sync Status */}
        <SyncStatus />
      </Flex>

      {/* Mobile Drawer */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose} size="xs">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton size="lg" top={4} right={4} />

          <Box px={6} py={6}>
            <Text fontSize="2xl" fontWeight="bold" color="brand.500">
              Inventario
            </Text>
          </Box>

          <Divider />

          <DrawerBody py={4} display="flex" flexDirection="column">
            <VStack spacing={2} align="stretch" flex={1}>
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
                    }}
                    _active={{
                      bg: 'brand.100',
                    }}
                    onClick={() => handleNavigate(item.path)}
                  >
                    <Icon as={item.icon} boxSize={6} mr={4} />
                    <Text fontSize="lg">{item.label}</Text>
                  </Flex>
                );
              })}
            </VStack>
          </DrawerBody>

          <DrawerFooter flexDirection="column" borderTop="1px" borderColor="gray.200" pt={4}>
            {/* User Info */}
            {user && (
              <Flex alignItems="center" w="full" mb={3}>
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
              variant="outline"
              colorScheme="red"
              w="full"
              onClick={handleLogout}
            >
              Cerrar Sesión
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
