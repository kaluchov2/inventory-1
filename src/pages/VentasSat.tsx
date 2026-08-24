import { Fragment, useEffect, useMemo, useState } from 'react';
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
  IconButton,
  ButtonGroup,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { FiCalendar, FiDownload, FiFileText } from 'react-icons/fi';
import { useTransactionStore } from '../store/transactionStore';
import { formatCurrency } from '../utils/formatters';
import { buildSatSalesRows, groupSatSalesRows, SatSalesDateRange } from '../utils/satSalesReport';
import { exportSatSalesToExcel } from '../utils/excelExport';
import { generateExitNotePdf } from '../utils/exitNotePdf';

const GROUPS_PER_PAGE = 15;

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

function isOnOrAfterDay(dateValue: string, dayStart: Date): boolean {
  const date = new Date(dateValue);
  return !Number.isNaN(date.getTime()) && date.getTime() >= dayStart.getTime();
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
  const [generatingTransactionId, setGeneratingTransactionId] = useState<string | null>(null);
  const transactionById = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );
  const rows = useMemo(
    () => buildSatSalesRows(transactions, getDateRangeForFilter(dateFilter)),
    [transactions, dateFilter],
  );
  const groups = useMemo(() => groupSatSalesRows(rows), [rows]);

  const totalPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));

  // Clamp back down if the row count shrinks (e.g. a realtime update removes
  // transactions) while the user is on a now out-of-range page.
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * GROUPS_PER_PAGE;
    return groups.slice(start, start + GROUPS_PER_PAGE);
  }, [groups, currentPage]);
  const todayStart = startOfLocalDay(new Date());

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

  const handleGenerateExitNote = async (transactionId: string) => {
    const transaction = transactionById.get(transactionId);
    if (!transaction) {
      toast({ title: 'No se encontró la venta completa', status: 'error', duration: 3500 });
      return;
    }
    setGeneratingTransactionId(transactionId);
    try {
      await generateExitNotePdf(transaction);
      toast({ title: 'Nota de salida generada', status: 'success', duration: 3000 });
    } catch (error) {
      toast({
        title: 'No se pudo generar la nota de salida',
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setGeneratingTransactionId(null);
    }
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      <HStack justify="space-between" wrap="wrap" gap={3}>
        <Heading size={{ base: 'lg', md: 'xl' }}>Ventas SAT</Heading>
        <HStack flexShrink={0} w={{ base: 'full', sm: 'auto' }}>
          <Icon as={FiCalendar} display={{ base: 'none', sm: 'block' }} />
          <Select
            value={dateFilter}
            onChange={(e) => handleFilterChange(e.target.value as DateFilter)}
            w="full"
            minW={{ base: '0', sm: '220px' }}
            bg="white"
            size="md"
            height="52px"
            minH="52px"
            sx={{ paddingBlock: 0 }}
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
          <Text color="gray.500">{groups.length} venta(s) · {rows.length} renglón(es)</Text>
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
                    <Th isNumeric>Total línea</Th>
                    <Th isNumeric>Total venta</Th>
                    <Th>Pago</Th>
                    <Th>Cliente</Th>
                    <Th>Comentarios</Th>
                    <Th>Acción</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {paginatedGroups.map((group) => {
                    const transaction = transactionById.get(group.transactionId);
                    const canGenerateExitNote = transaction
                      ? isOnOrAfterDay(transaction.date, todayStart)
                      : false;

                    return (
                      <Fragment key={group.transactionId}>
                        {group.rows.map((row, index) => (
                          <Tr key={`${group.transactionId}-${row.lineIndex}`} borderTopWidth={index === 0 ? '2px' : undefined} borderTopColor="gray.200">
                            {index === 0 && <Td rowSpan={group.rows.length}>{row.saleDate}</Td>}
                            <Td><Text noOfLines={1}>{row.description}</Text></Td>
                            <Td><Badge colorScheme={row.satStatus === 'Con clave' ? 'teal' : 'gray'}>{row.satCode}</Badge></Td>
                            <Td><Text noOfLines={1}>{row.satDescription}</Text></Td>
                            <Td isNumeric>{row.quantity}</Td>
                            <Td isNumeric>{formatCurrency(row.lineTotal)}</Td>
                            {index === 0 && <Td isNumeric rowSpan={group.rows.length} fontWeight="bold">{formatCurrency(group.transactionTotal)}</Td>}
                            {index === 0 && <Td rowSpan={group.rows.length}>{row.paymentMethod}</Td>}
                            {index === 0 && <Td rowSpan={group.rows.length}><Text noOfLines={2}>{row.customerName}</Text></Td>}
                            {index === 0 && <Td rowSpan={group.rows.length}><Text noOfLines={3}>{row.notes}</Text></Td>}
                            {index === 0 && (
                              <Td rowSpan={group.rows.length}>
                                {canGenerateExitNote && (
                                  <IconButton
                                    size="sm"
                                    minH="48px"
                                    minW="48px"
                                    icon={<Icon as={FiFileText} />}
                                    aria-label="Generar nota de salida"
                                    title="Generar nota de salida"
                                    onClick={() => handleGenerateExitNote(group.transactionId)}
                                    isLoading={generatingTransactionId === group.transactionId}
                                  />
                                )}
                              </Td>
                            )}
                          </Tr>
                        ))}
                      </Fragment>
                    );
                  })}
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
