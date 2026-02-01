import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Center, Spinner, VStack, Text } from '@chakra-ui/react';
import { Layout } from './components/layout';
import { Home } from './pages/Home';
import { Products } from './pages/Products';
import { Customers } from './pages/Customers';
import { Sales } from './pages/Sales';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { useAuthStore } from './store/authStore';
import { SyncInitializer } from './components/common/SyncInitializer';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isOfflineMode } = useAuthStore();

  // Show loading spinner while checking auth
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

  // Allow access if authenticated OR in offline mode
  if (isAuthenticated || isOfflineMode) {
    return <>{children}</>;
  }

  // Redirect to login
  return <Navigate to="/login" replace />;
}

function App() {
  const { initialize } = useAuthStore();

  // Initialize auth on app load
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      {/* Sync initializer - loads data and subscribes to real-time updates */}
      <SyncInitializer />

      <Routes>
        {/* Public route - Login */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />
          <Route path="productos" element={<Products />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="ventas" element={<Sales />} />
          <Route path="reportes" element={<Reports />} />
          <Route path="configuracion" element={<Settings />} />
        </Route>

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
