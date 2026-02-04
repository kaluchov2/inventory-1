import { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Box,
  Divider,
  Icon,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Checkbox,
  Badge,
  Alert,
  AlertIcon,
  useToast,
} from '@chakra-ui/react';
import { FiDollarSign } from 'react-icons/fi';
import { CurrencyInput } from '../common';
import { Customer, Transaction } from '../../types';
import { useTransactionStore } from '../../store/transactionStore';
import { useCustomerStore } from '../../store/customerStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { es } from '../../i18n/es';

interface ReceiveInstallmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onPaymentReceived: () => void;
}

export function ReceiveInstallmentModal({
  isOpen,
  onClose,
  customer,
  onPaymentReceived,
}: ReceiveInstallmentModalProps) {
  const toast = useToast();
  const { getUnpaidTransactionsByCustomer, addTransaction } = useTransactionStore();
  const { receivePayment } = useCustomerStore();

  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get unpaid transactions for this customer
  const unpaidTransactions = useMemo(() => {
    if (!customer) return [];
    return getUnpaidTransactionsByCustomer(customer.id);
  }, [customer, getUnpaidTransactionsByCustomer]);

  // Calculate pending amount for each transaction
  const getTransactionPending = (transaction: Transaction) => {
    const paid = transaction.cashAmount + transaction.transferAmount + transaction.cardAmount;
    return transaction.total - paid;
  };

  // Calculate total selected pending
  const selectedPendingTotal = useMemo(() => {
    return unpaidTransactions
      .filter(t => selectedTransactionIds.has(t.id))
      .reduce((sum, t) => sum + getTransactionPending(t), 0);
  }, [unpaidTransactions, selectedTransactionIds]);

  // Calculate total payment
  const totalPayment = cashAmount + transferAmount;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTransactionIds(new Set());
      setCashAmount(0);
      setTransferAmount(0);
      setNotes('');
    }
  }, [isOpen]);

  const handleToggleTransaction = (transactionId: string) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTransactionIds.size === unpaidTransactions.length) {
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedTransactionIds(new Set(unpaidTransactions.map(t => t.id)));
    }
  };

  const handleConfirm = () => {
    if (!customer || totalPayment <= 0) return;

    setIsSubmitting(true);
    try {
      // Create installment_payment transaction
      const paymentTransaction = {
        customerId: customer.id,
        customerName: customer.name,
        items: [],
        subtotal: totalPayment,
        discount: 0,
        total: totalPayment,
        paymentMethod: (cashAmount > 0 && transferAmount > 0) ? 'mixed' : (cashAmount > 0 ? 'cash' : 'transfer') as 'cash' | 'transfer' | 'mixed',
        cashAmount,
        transferAmount,
        cardAmount: 0,
        isInstallment: true,
        notes: notes || `Abono recibido para ${selectedTransactionIds.size} transaccion(es)`,
        date: new Date().toISOString(),
        type: 'installment_payment' as const,
      };

      addTransaction(paymentTransaction);

      // Update customer balance
      receivePayment(customer.id, totalPayment);

      toast({
        title: es.success.paymentReceived,
        description: `${formatCurrency(totalPayment)} recibido de ${customer.name}`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      onPaymentReceived();
      onClose();
    } catch (error) {
      toast({
        title: es.errors.saveError,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack>
            <Icon as={FiDollarSign} color="green.500" />
            <Text>{es.sales.receiveInstallment} - {customer.name}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Customer Balance Summary */}
            <Box bg="blue.50" p={4} borderRadius="lg">
              <Flex justify="space-between" align="center">
                <Text fontWeight="medium" color="blue.700">
                  Saldo Total Pendiente:
                </Text>
                <Text fontSize="xl" fontWeight="bold" color="blue.700">
                  {formatCurrency(customer.balance)}
                </Text>
              </Flex>
            </Box>

            <Divider />

            {/* Unpaid Transactions */}
            <Box>
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontWeight="semibold" fontSize="lg">
                  Transacciones Pendientes
                </Text>
                {unpaidTransactions.length > 0 && (
                  <Button size="xs" variant="ghost" onClick={handleSelectAll}>
                    {selectedTransactionIds.size === unpaidTransactions.length
                      ? 'Deseleccionar todo'
                      : 'Seleccionar todo'}
                  </Button>
                )}
              </Flex>

              {unpaidTransactions.length === 0 ? (
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">
                    No hay transacciones pendientes registradas. El saldo puede ser de compras anteriores no rastreadas.
                  </Text>
                </Alert>
              ) : (
                <VStack spacing={3} align="stretch" maxH="250px" overflowY="auto">
                  {unpaidTransactions.map(transaction => {
                    const pending = getTransactionPending(transaction);
                    const paid = transaction.total - pending;
                    const isSelected = selectedTransactionIds.has(transaction.id);

                    return (
                      <Box
                        key={transaction.id}
                        p={3}
                        bg={isSelected ? 'green.50' : 'gray.50'}
                        borderRadius="md"
                        border="2px"
                        borderColor={isSelected ? 'green.300' : 'transparent'}
                        cursor="pointer"
                        onClick={() => handleToggleTransaction(transaction.id)}
                        _hover={{ borderColor: isSelected ? 'green.400' : 'gray.200' }}
                      >
                        <HStack justify="space-between" mb={2}>
                          <Checkbox
                            isChecked={isSelected}
                            onChange={() => handleToggleTransaction(transaction.id)}
                            colorScheme="green"
                          />
                          <Text fontSize="sm" color="gray.600">
                            {formatDate(transaction.date)}
                          </Text>
                        </HStack>

                        <Flex justify="space-between" mb={2}>
                          <VStack align="start" spacing={0}>
                            <Text fontSize="sm">Total: {formatCurrency(transaction.total)}</Text>
                            <Text fontSize="sm" color="green.600">
                              Pagado: {formatCurrency(paid)}
                            </Text>
                          </VStack>
                          <Badge
                            colorScheme="orange"
                            fontSize="md"
                            px={2}
                            py={1}
                          >
                            Pendiente: {formatCurrency(pending)}
                          </Badge>
                        </Flex>

                        {transaction.items.length > 0 && (
                          <Box mt={2} pt={2} borderTop="1px" borderColor="gray.200">
                            <Text fontSize="xs" color="gray.500" mb={1}>
                              Productos:
                            </Text>
                            {transaction.items.slice(0, 3).map((item, idx) => (
                              <Text key={idx} fontSize="xs" color="gray.600" noOfLines={1}>
                                - {item.productName} ({item.quantity}x {formatCurrency(item.unitPrice)})
                              </Text>
                            ))}
                            {transaction.items.length > 3 && (
                              <Text fontSize="xs" color="gray.500">
                                ... y {transaction.items.length - 3} más
                              </Text>
                            )}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </VStack>
              )}

              {selectedTransactionIds.size > 0 && (
                <Flex justify="space-between" align="center" mt={3} p={2} bg="green.50" borderRadius="md">
                  <Text fontWeight="medium" color="green.700">
                    Total seleccionado:
                  </Text>
                  <Text fontWeight="bold" color="green.700">
                    {formatCurrency(selectedPendingTotal)}
                  </Text>
                </Flex>
              )}
            </Box>

            <Divider />

            {/* Payment Input */}
            <Box p={4} bg="gray.50" borderRadius="lg">
              <Text fontWeight="semibold" mb={3}>
                Recibir Pago
              </Text>

              <VStack spacing={3}>
                <FormControl>
                  <FormLabel fontSize="sm">{es.sales.cash}</FormLabel>
                  <CurrencyInput value={cashAmount} onChange={setCashAmount} size="lg" />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm">{es.sales.transfer}</FormLabel>
                  <CurrencyInput value={transferAmount} onChange={setTransferAmount} size="lg" />
                </FormControl>

                <Divider />

                <Flex justify="space-between" align="center" w="full">
                  <Text fontWeight="medium">Total a Recibir:</Text>
                  <Text fontSize="xl" fontWeight="bold" color="green.600">
                    {formatCurrency(totalPayment)}
                  </Text>
                </Flex>

                {totalPayment > customer.balance && (
                  <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    <Text fontSize="sm">
                      El pago excede el saldo pendiente ({formatCurrency(customer.balance)})
                    </Text>
                  </Alert>
                )}

                <FormControl>
                  <FormLabel fontSize="sm">{es.sales.notes}</FormLabel>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas del pago..."
                    bg="white"
                  />
                </FormControl>
              </VStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {es.actions.cancel}
          </Button>
          <Button
            colorScheme="green"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            isDisabled={totalPayment <= 0}
            leftIcon={<Icon as={FiDollarSign} />}
            size="lg"
          >
            Recibir {formatCurrency(totalPayment)}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
