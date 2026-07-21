import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Heading,
  VStack,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  HStack,
  Select,
  Icon,
  Button,
  ButtonGroup,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { FiCalendar, FiDownload } from 'react-icons/fi';
import { useTransactionStore } from '../store/transactionStore';
import { formatCurrency } from '../utils/formatters';
import { buildSatSalesRows, SatSalesDateRange } from '../utils/satSalesReport';
import { exportSatSalesToExcel } from '../utils/excelExport';

const ITEMS_PER_PAGE = 30;

type DateFilter = 'all' | 'today' | 'week' | 'month';

const dateFilterLabels: Record<DateFilter, string> = {
  all: 'todas',
  today: 'hoy',
  week: 'ultima_semana',
  month: 'este_mes',
};

// Local-calendar-day midnight (not UTC) so "Hoy"/"Semana"/"Mes" match the
// user's actual day instead of drifting with the UTC/local offset.
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Subtracts a month, clamping the day-of-month so it can't overflow into a
// later month when the target month is shorter (e.g. May 31 -> April 30).
function subtractMonthClamped(date: Date): Date {
  const firstOfTargetMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const daysInTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0,
  ).getDate();
  firstOfTargetMonth.setDate(Math.min(date.getDate(), daysInTargetMonth));
  return firstOfTargetMonth;
}

function getDateRangeForFilter(filter: DateFilter): SatSalesDateRange {
  if (filter === 'all') return {};

  const startOfToday = startOfLocalDay(new Date());
  // Exclusive upper bound: start of the day after "today", so the comparison
  // never depends on truncated/millisecond-less timestamp strings.
  const to = addDays(startOfToday, 1).toISOString();

  if (filter === 'today') {
    return { from: startOfToday.toISOString(), to };
  }

  if (filter === 'week') {
    return { from: addDays(startOfToday, -7).toISOString(), to };
  }

  return { from: subtractMonthClamped(startOfToday).toISOString(), to };
}

export function VentasSat() {
  const toast = useToast();
  const { transactions } = useTransactionStore();
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const rows = useMemo(
    () => buildSatSalesRows(transactions, getDateRangeForFilter(dateFilter)),
    [transactions, dateFilter],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));

  // Clamp back down if the row count shrinks (e.g. a realtime update removes
  // transactions) while the user is on a now out-of-range page.
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return rows.slice(start, start + ITEMS_PER_PAGE);
  }, [rows, currentPage]);

  const handleFilterChange = (value: DateFilter) => {
    setDateFilter(value);
    setCurrentPage(1);
  };

  const handleDownload = () => {
    if (rows.length === 0) {
      toast({
        title: 'No hay ventas para exportar',
        description: 'Seleccione otro periodo o registre ventas antes de descargar.',
        status: 'warning',
        duration: 3500,
        isClosable: true,
      });
      return;
    }
    exportSatSalesToExcel(rows, dateFilterLabels[dateFilter]);
    toast({
      title: 'Reporte descargado',
      description: `${rows.length} renglon(es) incluidos.`,
      status: 'success',
      duration: 3000,
    });
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      <HStack justify="space-between" wrap="wrap" gap={3}>
        <Heading size={{ base: 'lg', md: 'xl' }}>Ventas SAT</Heading>
        <HStack flexShrink={0}>
          <Icon as={FiCalendar} display={{ base: 'none', sm: 'block' }} />
          <Select
            value={dateFilter}
            onChange={(e) => handleFilterChange(e.target.value as DateFilter)}
            w={{ base: 'full', sm: 'auto' }}
            minW={{ base: '150px', sm: '190px' }}
            bg="white"
            size={{ base: 'sm', md: 'md' }}
          >
            <option value="all">Todas</option>
            <option value="today">Hoy</option>
            <option value="week">Última Semana</option>
            <option value="month">Último Mes</option>
          </Select>
        </HStack>
      </HStack>

      <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
        <Flex
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          gap={4}
          mb={4}
        >
          <Text color="gray.500">{rows.length} renglon(es) de venta</Text>
          <Button
            leftIcon={<Icon as={FiDownload} />}
            onClick={handleDownload}
            isDisabled={rows.length === 0}
          >
            Descargar Excel
          </Button>
        </Flex>

        {rows.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={4}>
            No hay ventas registradas en este periodo.
          </Text>
        ) : (
          <>
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Fecha</Th>
                    <Th>Producto</Th>
                    <Th>Clave SAT</Th>
                    <Th>Descripción SAT</Th>
                    <Th isNumeric>Cantidad</Th>
                    <Th isNumeric>Total</Th>
                    <Th>Pago</Th>
                    <Th>Cliente</Th>
                    <Th>Comentarios</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {paginatedRows.map((row, index) => (
                    <Tr key={`${row.saleDate}-${row.description}-${index}`}>
                      <Td>{row.saleDate}</Td>
                      <Td>
                        <Text noOfLines={1}>{row.description}</Text>
                      </Td>
                      <Td>
                        <Badge colorScheme={row.satStatus === 'Con clave' ? 'teal' : 'gray'}>
                          {row.satCode}
                        </Badge>
                      </Td>
                      <Td>
                        <Text noOfLines={1}>{row.satDescription}</Text>
                      </Td>
                      <Td isNumeric>{row.quantity}</Td>
                      <Td isNumeric>{formatCurrency(row.lineTotal)}</Td>
                      <Td>{row.paymentMethod}</Td>
                      <Td>
                        <Text noOfLines={1}>{row.customerName}</Text>
                      </Td>
                      <Td>
                        <Text noOfLines={1}>{row.notes}</Text>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>

            {totalPages > 1 && (
              <Flex justify="center" align="center" gap={4} py={4}>
                <ButtonGroup size="sm" isAttached variant="outline">
                  <Button
                    onClick={() => setCurrentPage(1)}
                    isDisabled={currentPage === 1}
                  >
                    Primera
                  </Button>
                  <Button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    isDisabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                </ButtonGroup>

                <Text fontSize="sm" color="gray.600">
                  Página {currentPage} de {totalPages}
                </Text>

                <ButtonGroup size="sm" isAttached variant="outline">
                  <Button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    isDisabled={currentPage === totalPages}
                  >
                    Siguiente
                  </Button>
                  <Button
                    onClick={() => setCurrentPage(totalPages)}
                    isDisabled={currentPage === totalPages}
                  >
                    Última
                  </Button>
                </ButtonGroup>
              </Flex>
            )}
          </>
        )}
      </Box>
    </VStack>
  );
}
