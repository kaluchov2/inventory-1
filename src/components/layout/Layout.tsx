import { Box, Flex } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export function Layout() {
  return (
    <Flex minH="100vh">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Navigation */}
      <MobileNav />

      {/* Main Content */}
      <Box
        as="main"
        flex={1}
        ml={{ base: 0, lg: '280px' }}
        mt={{ base: '60px', lg: 0 }}
        p={{ base: 4, md: 6, lg: 8 }}
        bg="gray.50"
        minH="100vh"
      >
        <Outlet />
      </Box>
    </Flex>
  );
}
