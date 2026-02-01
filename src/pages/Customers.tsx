import { useState, useMemo } from 'react';
import {
  Box,
  Heading,
  VStack,
  Button,
  Icon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  useDisclosure,
  useToast,
  Text,
  Flex,
} from '@chakra-ui/react';
import {
  FiPlus,
  FiMoreVertical,
  FiEdit2,
  FiTrash2,
  FiDollarSign,
} from 'react-icons/fi';
import { SearchInput, EmptyState, ConfirmDialog } from '../components/common';
import { CustomerForm } from '../components/customers';
import { useCustomerStore } from '../store/customerStore';
import { useTransactionStore } from '../store/transactionStore';
import { Customer } from '../types';
import { formatCurrency } from '../utils/formatters';
import { es } from '../i18n/es';

export function Customers() {
  const toast = useToast();

  const {
    customers,
    searchQuery,
    setSearchQuery,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getFilteredCustomers,
  } = useCustomerStore();

  useTransactionStore();

  const {
    isOpen: isFormOpen,
    onOpen: onFormOpen,
    onClose: onFormClose,
  } = useDisclosure();

  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const filteredCustomers = useMemo(() => getFilteredCustomers(), [customers, searchQuery]);

  const handleAddCustomer = () => {
    setSelectedCustomer(null);
    onFormOpen();
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    onFormOpen();
  };

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    onDeleteOpen();
  };

  const handleFormSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      if (selectedCustomer) {
        updateCustomer(selectedCustomer.id, data);
        toast({
          title: es.success.customerUpdated,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        addCustomer(data);
        toast({
          title: es.success.customerAdded,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
      onFormClose();
    } catch (error) {
      toast({
        title: es.errors.saveError,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = () => {
    if (customerToDelete) {
      deleteCustomer(customerToDelete.id);
      toast({
        title: es.success.customerDeleted,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onDeleteClose();
      setCustomerToDelete(null);
    }
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Heading size={{ base: 'lg', md: 'xl' }}>{es.customers.title}</Heading>
        <Button
          leftIcon={<Icon as={FiPlus} />}
          colorScheme="brand"
          size={{ base: 'md', md: 'lg' }}
          onClick={handleAddCustomer}
        >
          {es.customers.addCustomer}
        </Button>
      </Flex>

      {/* Search */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={es.customers.searchPlaceholder}
        />
        <Text mt={3} color="gray.500" fontSize="sm">
          {filteredCustomers.length} clientes encontrados
        </Text>
      </Box>

      {/* Customers Table */}
      <Box bg="white" borderRadius="xl" boxShadow="sm" overflowX="auto">
        {filteredCustomers.length === 0 ? (
          <EmptyState
            title={es.customers.noCustomers}
            message="Agregue clientes para comenzar"
            actionLabel={es.customers.addCustomer}
            onAction={handleAddCustomer}
          />
        ) : (
          <Table>
            <Thead bg="gray.50">
              <Tr>
                <Th>{es.customers.customerName}</Th>
                <Th>{es.customers.phone}</Th>
                <Th isNumeric>{es.customers.balance}</Th>
                <Th isNumeric>{es.customers.totalPurchases}</Th>
                <Th w="100px">Acciones</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredCustomers.map((customer) => (
                <Tr key={customer.id} _hover={{ bg: 'gray.50' }}>
                  <Td>
                    <Text fontWeight="medium">{customer.name}</Text>
                    {customer.email && (
                      <Text fontSize="sm" color="gray.500">
                        {customer.email}
                      </Text>
                    )}
                  </Td>
                  <Td>{customer.phone || '-'}</Td>
                  <Td isNumeric>
                    {customer.balance > 0 ? (
                      <Badge colorScheme="red" fontSize="md" px={2} py={1}>
                        {formatCurrency(customer.balance)}
                      </Badge>
                    ) : (
                      <Text color="green.500" fontWeight="medium">
                        Sin saldo
                      </Text>
                    )}
                  </Td>
                  <Td isNumeric fontWeight="medium">
                    {formatCurrency(customer.totalPurchases)}
                  </Td>
                  <Td>
                    <Menu>
                      <MenuButton
                        as={IconButton}
                        icon={<Icon as={FiMoreVertical} />}
                        variant="ghost"
                        aria-label="Acciones"
                      />
                      <MenuList>
                        <MenuItem
                          icon={<Icon as={FiEdit2} />}
                          onClick={() => handleEditCustomer(customer)}
                        >
                          {es.actions.edit}
                        </MenuItem>
                        {customer.balance > 0 && (
                          <MenuItem
                            icon={<Icon as={FiDollarSign} />}
                            color="green.500"
                          >
                            {es.sales.receiveInstallment}
                          </MenuItem>
                        )}
                        <MenuItem
                          icon={<Icon as={FiTrash2} />}
                          color="red.500"
                          onClick={() => handleDeleteClick(customer)}
                        >
                          {es.actions.delete}
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Box>

      {/* Customer Form Modal */}
      <CustomerForm
        isOpen={isFormOpen}
        onClose={onFormClose}
        onSubmit={handleFormSubmit}
        customer={selectedCustomer}
        isLoading={isLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={onDeleteClose}
        onConfirm={handleConfirmDelete}
        title={es.actions.delete}
        message={es.customers.deleteConfirm}
        confirmText={es.actions.delete}
      />
    </VStack>
  );
}
