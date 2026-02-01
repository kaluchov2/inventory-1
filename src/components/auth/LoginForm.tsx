import { useState } from 'react';
import {
  Box,
  VStack,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  Button,
  Text,
  Alert,
  AlertIcon,
  InputGroup,
  InputRightElement,
  IconButton,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuthStore } from '../../store/authStore';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login, signup, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email || !password) {
      setLocalError('Por favor complete todos los campos');
      return;
    }

    if (!validateEmail(email)) {
      setLocalError('Por favor ingrese un correo electrónico válido');
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      onSuccess?.();
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email || !password) {
      setLocalError('Por favor complete todos los campos');
      return;
    }

    if (!validateEmail(email)) {
      setLocalError('Por favor ingrese un correo electrónico válido');
      return;
    }

    if (password.length < 6) {
      setLocalError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    const result = await signup(email, password, displayName || undefined);
    if (result.success) {
      setSignupSuccess(true);
    }
  };

  const displayError = localError || error;

  return (
    <Box w="full" maxW="400px">
      <Tabs colorScheme="brand" isFitted>
        <TabList mb={6}>
          <Tab fontSize="lg" py={4}>Iniciar Sesión</Tab>
          <Tab fontSize="lg" py={4}>Registrarse</Tab>
        </TabList>

        <TabPanels>
          {/* Login Tab */}
          <TabPanel p={0}>
            <form onSubmit={handleLogin}>
              <VStack spacing={5}>
                {displayError && (
                  <Alert status="error" borderRadius="lg">
                    <AlertIcon />
                    <Text>{displayError}</Text>
                  </Alert>
                )}

                <FormControl isRequired isInvalid={!!localError && !email}>
                  <FormLabel fontSize="lg">Correo Electrónico</FormLabel>
                  <Input
                    type="email"
                    size="lg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    autoComplete="email"
                  />
                </FormControl>

                <FormControl isRequired isInvalid={!!localError && !password}>
                  <FormLabel fontSize="lg">Contraseña</FormLabel>
                  <InputGroup size="lg">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        icon={showPassword ? <FiEyeOff /> : <FiEye />}
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="brand"
                  size="lg"
                  w="full"
                  h="60px"
                  fontSize="xl"
                  isLoading={isLoading}
                  loadingText="Iniciando sesión..."
                >
                  Iniciar Sesión
                </Button>
              </VStack>
            </form>
          </TabPanel>

          {/* Signup Tab */}
          <TabPanel p={0}>
            {signupSuccess ? (
              <Alert
                status="success"
                variant="subtle"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                textAlign="center"
                py={8}
                borderRadius="lg"
              >
                <AlertIcon boxSize="40px" mr={0} mb={4} />
                <Text fontSize="lg" fontWeight="bold" mb={2}>
                  Registro Exitoso
                </Text>
                <Text color="gray.600">
                  Por favor revise su correo electrónico para confirmar su cuenta.
                </Text>
              </Alert>
            ) : (
              <form onSubmit={handleSignup}>
                <VStack spacing={5}>
                  {displayError && (
                    <Alert status="error" borderRadius="lg">
                      <AlertIcon />
                      <Text>{displayError}</Text>
                    </Alert>
                  )}

                  <FormControl>
                    <FormLabel fontSize="lg">Nombre (opcional)</FormLabel>
                    <Input
                      type="text"
                      size="lg"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Tu nombre"
                      autoComplete="name"
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel fontSize="lg">Correo Electrónico</FormLabel>
                    <Input
                      type="email"
                      size="lg"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      autoComplete="email"
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel fontSize="lg">Contraseña</FormLabel>
                    <InputGroup size="lg">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        autoComplete="new-password"
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          icon={showPassword ? <FiEyeOff /> : <FiEye />}
                          variant="ghost"
                          onClick={() => setShowPassword(!showPassword)}
                        />
                      </InputRightElement>
                    </InputGroup>
                    <FormErrorMessage>La contraseña debe tener al menos 6 caracteres</FormErrorMessage>
                  </FormControl>

                  <Button
                    type="submit"
                    colorScheme="green"
                    size="lg"
                    w="full"
                    h="60px"
                    fontSize="xl"
                    isLoading={isLoading}
                    loadingText="Registrando..."
                  >
                    Crear Cuenta
                  </Button>
                </VStack>
              </form>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
