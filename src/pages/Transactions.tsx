import { useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Icon,
  Input,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { FiSearch } from "react-icons/fi";
import { AutocompleteSelect } from "../components/common";
import { es } from "../i18n/es";
import { transactionService } from "../services/transactionService";
import { useCustomerStore } from "../store/customerStore";
import { useTransactionStore } from "../store/transactionStore";
import { Transaction } from "../types";
import { formatCurrency, formatDateTime } from "../utils/formatters";

const WALK_IN_OPTION_VALUE = "__WALK_IN__";

const normalizeCustomerKey = (value: string | undefined | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function getLocalDateKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mergeTransactions(remote: Transaction[], local: Transaction[]) {
  const merged = new Map<string, Transaction>();
  remote.forEach((tx) => merged.set(tx.id, tx));
  local.forEach((tx) => merged.set(tx.id, tx));
  return Array.from(merged.values());
}

export function Transactions() {
  const toast = useToast();
  const { customers } = useCustomerStore();
  const { transactions } = useTransactionStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Transaction[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const customerOptions = useMemo(
    () => [
      {
        value: WALK_IN_OPTION_VALUE,
        label: `${es.customers.walkIn} (sin registrar)`,
      },
      ...customers.map((c) => ({ value: c.id, label: c.name })),
    ],
    [customers],
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const summary = useMemo(() => {
    const total = searchResults.reduce((sum, tx) => sum + tx.total, 0);
    return { count: searchResults.length, total };
  }, [searchResults]);

  const handleSearch = async () => {
    if (!selectedCustomerId) {
      toast({
        title: "Seleccione un cliente",
        status: "warning",
        duration: 2500,
      });
      return;
    }
    if (!selectedDate) {
      toast({
        title: "Seleccione una fecha",
        status: "warning",
        duration: 2500,
      });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    const isWalkIn = selectedCustomerId === WALK_IN_OPTION_VALUE;
    const targetName = isWalkIn
      ? normalizeCustomerKey(es.customers.walkIn)
      : normalizeCustomerKey(selectedCustomer?.name);

    let source = transactions;

    try {
      const remoteQuery = isWalkIn
        ? transactionService.getWalkInSales(es.customers.walkIn)
        : Promise.all([
            transactionService.getByCustomer(selectedCustomerId),
            transactionService.getSalesForCustomer(
              selectedCustomerId,
              selectedCustomer?.name,
            ),
          ]).then(([byCustomer, byNameSales]) =>
            mergeTransactions(byCustomer, byNameSales),
          );

      const remoteTransactions = await Promise.race([
        remoteQuery,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("transaction_fetch_timeout")), 15000),
        ),
      ]);
      source = mergeTransactions(remoteTransactions, transactions);
    } catch (error) {
      console.warn(
        "[Transactions] Remote query failed, using local cache for validation:",
        error,
      );
      toast({
        title: "Usando cache local",
        description:
          "No se pudo completar la consulta remota. Mostrando datos locales.",
        status: "warning",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setIsSearching(false);
    }

    const filtered = source
      .filter((tx) => {
        if (isWalkIn) {
          return (
            !tx.customerId &&
            normalizeCustomerKey(tx.customerName) ===
              normalizeCustomerKey(es.customers.walkIn)
          );
        }
        return (
          tx.customerId === selectedCustomerId ||
          normalizeCustomerKey(tx.customerName) === targetName
        );
      })
      .filter((tx) => getLocalDateKey(tx.date) === selectedDate)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setSearchResults(filtered);
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      <Heading size={{ base: "lg", md: "xl" }}>Transacciones</Heading>

      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <VStack spacing={4} align="stretch">
          <Text color="gray.600">
            Seleccione cliente y fecha para validar transacciones registradas.
          </Text>
          <HStack spacing={3} flexWrap="wrap" align="flex-end">
            <Box flex="1" minW="220px">
              <Text fontSize="sm" fontWeight="semibold" mb={1}>
                Cliente
              </Text>
              <AutocompleteSelect
                options={customerOptions}
                value={selectedCustomerId || ""}
                onChange={(val) => setSelectedCustomerId(val ? String(val) : null)}
                placeholder="Seleccionar Cliente..."
              />
            </Box>
            <Box minW="180px">
              <Text fontSize="sm" fontWeight="semibold" mb={1}>
                Fecha
              </Text>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                bg="white"
              />
            </Box>
            <Button
              colorScheme="blue"
              leftIcon={<Icon as={FiSearch} />}
              onClick={handleSearch}
              isLoading={isSearching}
              loadingText="Consultando..."
              isDisabled={!selectedCustomerId || !selectedDate}
            >
              Buscar
            </Button>
          </HStack>
        </VStack>
      </Box>

      {hasSearched && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Stat bg="white" p={4} borderRadius="lg" boxShadow="sm">
            <StatLabel>Transacciones encontradas</StatLabel>
            <StatNumber>{summary.count}</StatNumber>
          </Stat>
          <Stat bg="white" p={4} borderRadius="lg" boxShadow="sm">
            <StatLabel>Total transaccionado</StatLabel>
            <StatNumber color="green.600">
              {formatCurrency(summary.total)}
            </StatNumber>
          </Stat>
        </SimpleGrid>
      )}

      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <Heading size={{ base: "sm", md: "md" }} mb={4}>
          Resultado
        </Heading>

        {!hasSearched ? (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            Seleccione cliente y fecha para consultar ventas.
          </Alert>
        ) : searchResults.length === 0 ? (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            No se encontraron transacciones para ese cliente en esa fecha.
          </Alert>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>Tipo</Th>
                  <Th>Artículos</Th>
                  <Th isNumeric>Total</Th>
                  <Th>Método</Th>
                </Tr>
              </Thead>
              <Tbody>
                {searchResults.map((tx) => (
                  <Tr key={tx.id}>
                    <Td>{formatDateTime(tx.date)}</Td>
                    <Td fontWeight="medium">{tx.customerName || es.customers.walkIn}</Td>
                    <Td>
                      <Badge colorScheme={tx.type === "sale" ? "green" : "orange"}>
                        {tx.type === "sale" ? "Venta" : "Abono"}
                      </Badge>
                    </Td>
                    <Td>{tx.items.length}</Td>
                    <Td isNumeric fontWeight="bold" color="green.600">
                      {formatCurrency(tx.total)}
                    </Td>
                    <Td>
                      <Badge
                        colorScheme={
                          tx.paymentMethod === "cash"
                            ? "green"
                            : tx.paymentMethod === "transfer"
                              ? "blue"
                              : tx.paymentMethod === "card"
                                ? "purple"
                                : "gray"
                        }
                      >
                        {tx.paymentMethod === "cash"
                          ? "Efectivo"
                          : tx.paymentMethod === "transfer"
                            ? "Transferencia"
                            : tx.paymentMethod === "card"
                              ? "Tarjeta"
                              : tx.paymentMethod === "mixed"
                                ? "Mixto"
                                : "Crédito"}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Box>
    </VStack>
  );
}
