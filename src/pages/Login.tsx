import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Center,
  VStack,
  Heading,
  Text,
  Icon,
  Button,
  Alert,
  AlertIcon,
  Spinner,
} from '@chakra-ui/react';
import { FiPackage, FiWifiOff } from 'react-icons/fi';
import { LoginForm } from '../components/auth';
import { useAuthStore } from '../store/authStore';
import { isSupabaseConfigured } from '../lib/supabase';

export function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, setOfflineMode } = useAuthStore();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleLoginSuccess = () => {
    navigate('/', { replace: true });
  };

  const handleOfflineMode = () => {
    setOfflineMode(true);
    navigate('/', { replace: true });
  };

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <Center h="100vh" bg="gray.50">
        <VStack spacing={4}>
          <Spinner size="xl" color="brand.500" thickness="4px" />
          <Text color="gray.600">Cargando...</Text>
        </VStack>
      </Center>
    );
  }

  // If Supabase is not configured, show offline mode option
  const supabaseNotConfigured = !isSupabaseConfigured();

  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <VStack spacing={8} w="full" maxW="400px">
        {/* Logo/Header */}
        <VStack spacing={2}>
          <Icon as={FiPackage} boxSize={16} color="brand.500" />
          <Heading size="xl" color="gray.800">
            Sistema de Inventario
          </Heading>
          <Text color="gray.600" textAlign="center">
            Gestión de productos, clientes y ventas
          </Text>
        </VStack>

        {/* Warning if Supabase not configured */}
        {supabaseNotConfigured && (
          <Alert status="warning" borderRadius="lg">
            <AlertIcon />
            <Box>
              <Text fontWeight="bold">Modo sin conexión</Text>
              <Text fontSize="sm">
                Supabase no está configurado. Los datos solo se guardarán localmente.
              </Text>
            </Box>
          </Alert>
        )}

        {/* Login Form or Offline Mode Button */}
        {supabaseNotConfigured ? (
          <VStack spacing={4} w="full">
            <Button
              colorScheme="brand"
              size="lg"
              w="full"
              h="60px"
              fontSize="xl"
              leftIcon={<Icon as={FiWifiOff} />}
              onClick={handleOfflineMode}
            >
              Continuar Sin Conexión
            </Button>
            <Text fontSize="sm" color="gray.500" textAlign="center">
              Para habilitar sincronización en la nube, configure las variables de entorno
              VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
            </Text>
          </VStack>
        ) : (
          <>
            <Box
              bg="white"
              p={{ base: 6, md: 8 }}
              borderRadius="xl"
              boxShadow="lg"
              w="full"
            >
              <LoginForm onSuccess={handleLoginSuccess} />
            </Box>

            {/* Offline mode option */}
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Icon as={FiWifiOff} />}
              onClick={handleOfflineMode}
              color="gray.500"
            >
              Continuar sin conexión
            </Button>
          </>
        )}
      </VStack>
    </Center>
  );
}
