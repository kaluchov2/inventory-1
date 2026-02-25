import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Heading,
  VStack,
  HStack,
  Button,
  Icon,
  Text,
  useToast,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  SimpleGrid,
  Progress,
  List,
  ListItem,
  ListIcon,
  Badge,
  Stat,
  StatLabel,
  StatNumber,
} from '@chakra-ui/react';
import {
  FiUpload,
  FiDownload,
  FiDatabase,
  FiRefreshCw,
  FiCheck,
  FiAlertCircle,
  FiPackage,
  FiUsers,
  FiShoppingCart,
  FiBox,
  FiUserCheck,
  FiTrash2,
} from 'react-icons/fi';
import { useProductStore, ImportSyncResult } from '../store/productStore';
import { useCustomerStore } from '../store/customerStore';
import { useTransactionStore } from '../store/transactionStore';
import { useDropStore } from '../store/dropStore';
import { useStaffStore } from '../store/staffStore';
import { importExcelFile, ImportResult } from '../utils/excelImport';
import {
  exportProductsToExcel,
  exportCustomersToExcel,
  exportTransactionsToExcel,
  exportAllToExcel,
} from '../utils/excelExport';
import { exportBackup, importBackup, BackupData } from '../utils/storage';
import { es } from '../i18n/es';
import { UPS_BATCH_OPTIONS } from '../constants/colors';
import { AutocompleteSelect } from '../components/common';
import { syncQueue } from '../lib/syncQueue';
import { syncManager } from '../lib/syncManager';

export function Settings() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const { products, importProducts } = useProductStore();
  const { customers, importCustomers } = useCustomerStore();
  const { transactions, importTransactions } = useTransactionStore();
  const { drops, addDrop } = useDropStore();
  const { staff, addStaff } = useStaffStore();

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [syncResult, setSyncResult] = useState<ImportSyncResult | null>(null);
  const [queueInfo, setQueueInfo] = useState<{count: number; sizeKB: string; oldestOperation?: string} | null>(null);
  const [exportUps, setExportUps] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<'full' | 'by_ups'>('full');
  const [importUpsScope, setImportUpsScope] = useState<string | null>(null);

  const filteredByUpsCount = useMemo(() => {
    if (!exportUps) return 0;
    return products.filter(p => Number(p.upsBatch) === exportUps).length;
  }, [products, exportUps]);

  const importUpsScopeCount = useMemo(() => {
    if (!importUpsScope || !importResult) return 0;
    return importResult.products.filter(p => p.dropNumber === importUpsScope).length;
  }, [importResult, importUpsScope]);

  const handleExportByUps = () => {
    if (!exportUps) return;
    const filtered = products.filter(p => Number(p.upsBatch) === exportUps);
    const date = new Date().toISOString().split('T')[0];
    exportProductsToExcel(filtered, `inventario_UPS${exportUps}_${date}.xlsx`);
  };

  // Update queue info on mount and when sync status changes
  useEffect(() => {
    const updateQueueInfo = () => {
      try {
        const info = syncQueue.getQueueInfo();
        setQueueInfo(info);
      } catch (error) {
        console.error('Failed to get queue info:', error);
      }
    };

    updateQueueInfo();

    // Subscribe to sync status updates to refresh queue info
    const unsubscribe = syncManager.subscribe(() => {
      updateQueueInfo();
    });

    return () => { unsubscribe(); };
  }, []);

  // Handle Excel file import
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress(20);

    try {
      setImportProgress(40);
      const result = await importExcelFile(file);
      setImportProgress(80);
      setImportResult(result);
      setImportProgress(100);

      toast({
        title: 'Archivo procesado',
        description: `${result.products.length} productos, ${result.customers.length} clientes, ${result.transactions.length} transacciones encontrados`,
        status: 'success',
        duration: 5000,
      });
    } catch (error) {
      toast({
        title: es.errors.importError,
        description: String(error),
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Confirm import with sync mode
  const handleConfirmImport = async () => {
    if (!importResult) return;

    let result: ImportSyncResult | null = null;

    // V2: Import drops first (they're referenced by products)
    if (importResult.drops && importResult.drops.length > 0) {
      const existingDropNumbers = new Set(drops.map(d => d.dropNumber));
      for (const drop of importResult.drops) {
        if (!existingDropNumbers.has(drop.dropNumber)) {
          addDrop({
            dropNumber: drop.dropNumber,
            arrivalDate: drop.arrivalDate,
            status: drop.status,
            notes: drop.notes,
          });
        }
      }
    }

    // V2: Import staff (they're referenced by products)
    if (importResult.staff && importResult.staff.length > 0) {
      const existingStaffNames = new Set(staff.map(s => s.name.toLowerCase()));
      for (const staffMember of importResult.staff) {
        if (!existingStaffNames.has(staffMember.name.toLowerCase())) {
          addStaff({
            name: staffMember.name,
            isActive: staffMember.isActive,
            notes: staffMember.notes,
          });
        }
      }
    }

    // Import products: use 'replace' for first import (no existing products),
    // use 'sync' or 'sync_by_ups' for updates
    if (importResult.products.length > 0) {
      if (importMode === 'by_ups' && importUpsScope) {
        result = await importProducts(importResult.products, 'sync_by_ups', importUpsScope);
      } else {
        const mode = products.length > 0 ? 'sync' : 'replace';
        result = await importProducts(importResult.products, mode);
      }
      setSyncResult(result);
    }

    if (importResult.customers.length > 0) {
      importCustomers(importResult.customers);
    }
    if (importResult.transactions.length > 0) {
      importTransactions(importResult.transactions);
    }

    // Reset import mode state
    const usedUpsScope = importMode === 'by_ups' ? importUpsScope : null;
    setImportMode('full');
    setImportUpsScope(null);

    // Show detailed sync result
    if (result) {
      toast({
        title: usedUpsScope
          ? `Sincronización UPS ${usedUpsScope} completada`
          : 'Sincronización completada',
        description: `Creados: ${result.created}, Actualizados: ${result.updated}, Eliminados: ${result.deleted}, Sin cambios: ${result.unchanged}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } else {
      toast({
        title: es.settings.dataImported,
        status: 'success',
        duration: 3000,
      });
    }

    setImportResult(null);
  };

  // Cancel import
  const handleCancelImport = () => {
    setImportResult(null);
    setImportProgress(0);
    setSyncResult(null);
    setImportMode('full');
    setImportUpsScope(null);
  };

  // Clear sync queue
  const handleClearQueue = () => {
    if (window.confirm('¿Está seguro de que desea limpiar todas las operaciones de sincronización pendientes? Esta acción no se puede deshacer.')) {
      try {
        syncQueue.clearQueue();
        setQueueInfo(syncQueue.getQueueInfo());
        toast({
          title: 'Cola de sincronización limpiada',
          description: 'Todas las operaciones pendientes han sido eliminadas. Actualice la página si es necesario.',
          status: 'success',
          duration: 5000,
        });
      } catch (error) {
        toast({
          title: 'Error al limpiar la cola',
          description: String(error),
          status: 'error',
          duration: 5000,
        });
      }
    }
  };

  // Handle backup file import
  const handleBackupSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup: BackupData = JSON.parse(text);

      const success = importBackup(backup);
      if (success) {
        toast({
          title: es.settings.backupRestored,
          description: 'Por favor recargue la página para ver los datos',
          status: 'success',
          duration: 5000,
        });
        // Reload after a short delay
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (error) {
      toast({
        title: 'Error al restaurar respaldo',
        description: 'El archivo no es un respaldo válido',
        status: 'error',
        duration: 5000,
      });
    }

    if (backupInputRef.current) {
      backupInputRef.current.value = '';
    }
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      <Heading size={{ base: 'lg', md: 'xl' }}>{es.settings.title}</Heading>

      {/* Import Preview */}
      {importResult && (
        <Alert
          status="info"
          variant="subtle"
          flexDirection="column"
          alignItems="start"
          borderRadius="xl"
          p={{ base: 4, md: 6 }}
        >
          <VStack w="full" spacing={4} mb={4} align="stretch">
            <HStack>
              <AlertIcon boxSize={6} />
              <AlertTitle fontSize={{ base: 'lg', md: 'xl' }}>Vista Previa de Importación</AlertTitle>
            </HStack>
            <HStack spacing={2} flexWrap="wrap">
              <Button
                colorScheme="gray"
                variant="outline"
                size={{ base: 'md', md: 'md' }}
                onClick={handleCancelImport}
              >
                Cancelar
              </Button>
              <Button
                colorScheme="green"
                leftIcon={<Icon as={FiCheck} />}
                size={{ base: 'md', md: 'md' }}
                onClick={handleConfirmImport}
                isDisabled={importMode === 'by_ups' && !importUpsScope}
              >
                {importMode === 'by_ups' && importUpsScope
                  ? `Confirmar UPS ${importUpsScope}`
                  : 'Confirmar'}
              </Button>
            </HStack>
          </VStack>

          <SimpleGrid columns={{ base: 2, sm: 3, md: 5 }} spacing={{ base: 2, md: 4 }} w="full" mb={4}>
            <Box p={4} bg="white" borderRadius="lg" textAlign="center">
              <Icon as={FiPackage} boxSize={6} color="blue.500" mb={2} />
              <Text fontSize="2xl" fontWeight="bold">{importResult.products.length}</Text>
              <Text color="gray.600">Productos</Text>
            </Box>
            <Box p={4} bg="white" borderRadius="lg" textAlign="center">
              <Icon as={FiUsers} boxSize={6} color="green.500" mb={2} />
              <Text fontSize="2xl" fontWeight="bold">{importResult.customers.length}</Text>
              <Text color="gray.600">Clientes</Text>
            </Box>
            <Box p={4} bg="white" borderRadius="lg" textAlign="center">
              <Icon as={FiShoppingCart} boxSize={6} color="purple.500" mb={2} />
              <Text fontSize="2xl" fontWeight="bold">{importResult.transactions.length}</Text>
              <Text color="gray.600">Transacciones</Text>
            </Box>
            {/* V2: Drops and Staff */}
            <Box p={4} bg="white" borderRadius="lg" textAlign="center">
              <Icon as={FiBox} boxSize={6} color="orange.500" mb={2} />
              <Text fontSize="2xl" fontWeight="bold">{importResult.drops?.length || 0}</Text>
              <Text color="gray.600">Drops</Text>
            </Box>
            <Box p={4} bg="white" borderRadius="lg" textAlign="center">
              <Icon as={FiUserCheck} boxSize={6} color="teal.500" mb={2} />
              <Text fontSize="2xl" fontWeight="bold">{importResult.staff?.length || 0}</Text>
              <Text color="gray.600">Personal</Text>
            </Box>
          </SimpleGrid>

          {/* Import mode selector — only shown when DB has existing products */}
          {importResult.products.length > 0 && products.length > 0 && (
            <Box w="full" p={4} bg="white" borderRadius="lg">
              <Text fontWeight="bold" mb={2}>Modo de Importación</Text>
              <HStack spacing={2} mb={importMode === 'by_ups' ? 3 : 0}>
                <Button
                  size="sm"
                  colorScheme={importMode === 'full' ? 'blue' : 'gray'}
                  variant={importMode === 'full' ? 'solid' : 'outline'}
                  onClick={() => { setImportMode('full'); setImportUpsScope(null); }}
                >
                  Sincronización Completa
                </Button>
                <Button
                  size="sm"
                  colorScheme={importMode === 'by_ups' ? 'teal' : 'gray'}
                  variant={importMode === 'by_ups' ? 'solid' : 'outline'}
                  onClick={() => setImportMode('by_ups')}
                >
                  Subir por UPS
                </Button>
              </HStack>
              {importMode === 'by_ups' && (
                <VStack align="stretch" spacing={2}>
                  <Box maxW="300px">
                    <AutocompleteSelect
                      options={UPS_BATCH_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))}
                      value={importUpsScope || ''}
                      onChange={(val) => setImportUpsScope(val ? String(val) : null)}
                      placeholder="Seleccionar UPS..."
                    />
                  </Box>
                  {importUpsScope && (
                    <Text fontSize="sm" color="gray.600">
                      {importUpsScopeCount} productos del Excel coinciden con UPS {importUpsScope}
                    </Text>
                  )}
                  <Text fontSize="xs" color="gray.500">
                    Solo se crearán/actualizarán productos del UPS seleccionado. No se eliminará nada.
                  </Text>
                </VStack>
              )}
            </Box>
          )}

          {importResult.errors.length > 0 && (
            <Box w="full">
              <Text fontWeight="bold" color="orange.600" mb={2}>
                <Icon as={FiAlertCircle} mr={2} />
                {importResult.errors.length} advertencias:
              </Text>
              <List maxH="150px" overflowY="auto">
                {importResult.errors.slice(0, 5).map((error, i) => (
                  <ListItem key={i} fontSize="sm" color="orange.600">
                    <ListIcon as={FiAlertCircle} />
                    {error}
                  </ListItem>
                ))}
                {importResult.errors.length > 5 && (
                  <ListItem fontSize="sm" color="orange.600">
                    ... y {importResult.errors.length - 5} más
                  </ListItem>
                )}
              </List>
            </Box>
          )}
        </Alert>
      )}

      {/* Current Data Stats */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <Heading size={{ base: 'sm', md: 'md' }} mb={4}>Datos Actuales</Heading>
        <SimpleGrid columns={{ base: 2, sm: 3, md: 5 }} spacing={4}>
          <HStack p={4} bg="gray.50" borderRadius="lg">
            <Icon as={FiPackage} boxSize={6} color="blue.500" />
            <Box>
              <Text fontWeight="bold">{products.length}</Text>
              <Text fontSize="sm" color="gray.600">Productos</Text>
            </Box>
          </HStack>
          <HStack p={4} bg="gray.50" borderRadius="lg">
            <Icon as={FiUsers} boxSize={6} color="green.500" />
            <Box>
              <Text fontWeight="bold">{customers.length}</Text>
              <Text fontSize="sm" color="gray.600">Clientes</Text>
            </Box>
          </HStack>
          <HStack p={4} bg="gray.50" borderRadius="lg">
            <Icon as={FiShoppingCart} boxSize={6} color="purple.500" />
            <Box>
              <Text fontWeight="bold">{transactions.length}</Text>
              <Text fontSize="sm" color="gray.600">Transacciones</Text>
            </Box>
          </HStack>
          {/* V2: Drops and Staff */}
          <HStack p={4} bg="gray.50" borderRadius="lg">
            <Icon as={FiBox} boxSize={6} color="orange.500" />
            <Box>
              <Text fontWeight="bold">{drops.length}</Text>
              <Text fontSize="sm" color="gray.600">Drops</Text>
            </Box>
          </HStack>
          <HStack p={4} bg="gray.50" borderRadius="lg">
            <Icon as={FiUserCheck} boxSize={6} color="teal.500" />
            <Box>
              <Text fontWeight="bold">{staff.length}</Text>
              <Text fontSize="sm" color="gray.600">Personal</Text>
            </Box>
          </HStack>
        </SimpleGrid>

        {/* V2: Sync Result Summary */}
        {syncResult && (
          <Box mt={4} p={4} bg="green.50" borderRadius="lg">
            <Text fontWeight="bold" color="green.700" mb={2}>Última Sincronización:</Text>
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
              <Stat size="sm">
                <StatLabel>Creados</StatLabel>
                <StatNumber color="green.600">{syncResult.created}</StatNumber>
              </Stat>
              <Stat size="sm">
                <StatLabel>Actualizados</StatLabel>
                <StatNumber color="blue.600">{syncResult.updated}</StatNumber>
              </Stat>
              <Stat size="sm">
                <StatLabel>Eliminados</StatLabel>
                <StatNumber color="red.600">{syncResult.deleted}</StatNumber>
              </Stat>
              <Stat size="sm">
                <StatLabel>Sin Cambios</StatLabel>
                <StatNumber color="gray.600">{syncResult.unchanged}</StatNumber>
              </Stat>
            </SimpleGrid>
          </Box>
        )}
      </Box>

      {/* Import from Excel */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <Heading size={{ base: 'sm', md: 'md' }} mb={4}>{es.settings.importFromExcel}</Heading>
        <Text color="gray.600" mb={4} fontSize={{ base: 'sm', md: 'md' }}>
          Importe datos desde su archivo Excel (Cuentas_UPS.xlsx). Se procesarán las hojas
          "Inventario", "Inventario Comp Y Cel" y "Pagos".
        </Text>

        {isImporting && (
          <Box mb={4}>
            <Text mb={2}>Procesando archivo...</Text>
            <Progress value={importProgress} colorScheme="brand" borderRadius="full" />
          </Box>
        )}

        <input
          type="file"
          ref={fileInputRef}
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        <Button
          leftIcon={<Icon as={FiUpload} />}
          colorScheme="brand"
          size={{ base: 'md', md: 'lg' }}
          w={{ base: 'full', md: 'auto' }}
          onClick={() => fileInputRef.current?.click()}
          isLoading={isImporting}
          loadingText="Importando..."
        >
          Seleccionar Archivo Excel
        </Button>
      </Box>

      {/* Export to Excel */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <Heading size={{ base: 'sm', md: 'md' }} mb={4}>{es.settings.exportToExcel}</Heading>
        <Text color="gray.600" mb={4} fontSize={{ base: 'sm', md: 'md' }}>
          Exporte sus datos a archivos Excel compatibles con su formato actual.
        </Text>

        <SimpleGrid columns={{ base: 2, md: 2 }} spacing={{ base: 2, md: 4 }}>
          <Button
            leftIcon={<Icon as={FiDownload} />}
            colorScheme="blue"
            variant="outline"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={() => exportProductsToExcel(products)}
            isDisabled={products.length === 0}
          >
            Inventario
            <Badge ml={1} fontSize={{ base: '2xs', md: 'sm' }}>{products.length}</Badge>
          </Button>

          <Button
            leftIcon={<Icon as={FiDownload} />}
            colorScheme="green"
            variant="outline"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={() => exportCustomersToExcel(customers)}
            isDisabled={customers.length === 0}
          >
            Clientes
            <Badge ml={1} fontSize={{ base: '2xs', md: 'sm' }}>{customers.length}</Badge>
          </Button>

          <Button
            leftIcon={<Icon as={FiDownload} />}
            colorScheme="purple"
            variant="outline"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={() => exportTransactionsToExcel(transactions)}
            isDisabled={transactions.length === 0}
          >
            Transacciones
            <Badge ml={1} fontSize={{ base: '2xs', md: 'sm' }}>{transactions.length}</Badge>
          </Button>

          <Button
            leftIcon={<Icon as={FiDownload} />}
            colorScheme="orange"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={() => exportAllToExcel(products, customers, transactions)}
            isDisabled={products.length === 0 && customers.length === 0 && transactions.length === 0}
          >
            Todo
          </Button>
        </SimpleGrid>

        <HStack mt={4} spacing={{ base: 2, md: 4 }} flexWrap="wrap">
          <Box flex="1" minW="180px" maxW="300px">
            <AutocompleteSelect
              options={UPS_BATCH_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))}
              value={exportUps ? String(exportUps) : ''}
              onChange={(val) => setExportUps(val ? Number(val) : null)}
              placeholder="Seleccionar UPS..."
            />
          </Box>
          <Button
            leftIcon={<Icon as={FiDownload} />}
            colorScheme="teal"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={handleExportByUps}
            isDisabled={!exportUps || filteredByUpsCount === 0}
          >
            {exportUps ? `Descargar UPS ${exportUps}` : 'Descargar UPS'}
            {exportUps && <Badge ml={2} colorScheme="teal" fontSize={{ base: '2xs', md: 'sm' }}>{filteredByUpsCount}</Badge>}
          </Button>
        </HStack>
      </Box>

      {/* Sync Queue Management */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <Heading size={{ base: 'sm', md: 'md' }} mb={4}>Cola de Sincronización</Heading>
        <Text color="gray.600" mb={4} fontSize={{ base: 'sm', md: 'md' }}>
          Gestione las operaciones de sincronización pendientes entre su dispositivo y Supabase.
        </Text>

        {queueInfo && (
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={4}>
            <Stat size="sm" p={4} bg="gray.50" borderRadius="lg">
              <StatLabel>Operaciones Pendientes</StatLabel>
              <StatNumber color={queueInfo.count > 100 ? "orange.600" : "blue.600"}>
                {queueInfo.count}
              </StatNumber>
            </Stat>
            <Stat size="sm" p={4} bg="gray.50" borderRadius="lg">
              <StatLabel>Tamaño en Memoria</StatLabel>
              <StatNumber color={parseFloat(queueInfo.sizeKB) > 1000 ? "orange.600" : "green.600"}>
                {queueInfo.sizeKB} KB
              </StatNumber>
            </Stat>
            <Stat size="sm" p={4} bg="gray.50" borderRadius="lg">
              <StatLabel>Operación Más Antigua</StatLabel>
              <StatNumber fontSize="sm">
                {queueInfo.oldestOperation
                  ? new Date(queueInfo.oldestOperation).toLocaleString('es-MX', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'N/A'}
              </StatNumber>
            </Stat>
          </SimpleGrid>
        )}

        {queueInfo && queueInfo.count > 0 && (
          <>
            <Button
              leftIcon={<Icon as={FiTrash2} />}
              colorScheme="red"
              variant="outline"
              size={{ base: 'sm', md: 'lg' }}
              fontSize={{ base: 'xs', md: 'md' }}
              onClick={handleClearQueue}
              w={{ base: 'full', md: 'auto' }}
            >
              Limpiar Cola de Sincronización
            </Button>

            {(queueInfo.count > 100 || parseFloat(queueInfo.sizeKB) > 1000) && (
              <Alert status="warning" mt={4} borderRadius="lg">
                <AlertIcon />
                <Box>
                  <AlertTitle fontSize={{ base: 'sm', md: 'md' }}>Cola Grande Detectada</AlertTitle>
                  <AlertDescription fontSize={{ base: 'sm', md: 'md' }}>
                    Tiene {queueInfo.count} operaciones pendientes ocupando {queueInfo.sizeKB} KB.
                    Si la sincronización está atascada, limpie la cola y vuelva a importar sus datos.
                  </AlertDescription>
                </Box>
              </Alert>
            )}
          </>
        )}

        {queueInfo && queueInfo.count === 0 && (
          <Alert status="success" borderRadius="lg">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize={{ base: 'sm', md: 'md' }}>Cola Vacía</AlertTitle>
              <AlertDescription fontSize={{ base: 'sm', md: 'md' }}>
                No hay operaciones de sincronización pendientes.
              </AlertDescription>
            </Box>
          </Alert>
        )}
      </Box>

      {/* Backup & Restore */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <Heading size={{ base: 'sm', md: 'md' }} mb={4}>{es.settings.backup}</Heading>
        <Text color="gray.600" mb={4} fontSize={{ base: 'sm', md: 'md' }}>
          Cree respaldos de todos sus datos en formato JSON. Puede restaurar estos respaldos
          en cualquier momento.
        </Text>

        <input
          type="file"
          ref={backupInputRef}
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleBackupSelect}
        />

        <SimpleGrid columns={2} spacing={{ base: 2, md: 4 }}>
          <Button
            leftIcon={<Icon as={FiDatabase} />}
            colorScheme="green"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={exportBackup}
          >
            Crear Respaldo
          </Button>

          <Button
            leftIcon={<Icon as={FiRefreshCw} />}
            colorScheme="orange"
            variant="outline"
            size={{ base: 'sm', md: 'lg' }}
            fontSize={{ base: 'xs', md: 'md' }}
            onClick={() => backupInputRef.current?.click()}
          >
            Restaurar
          </Button>
        </SimpleGrid>

        <Alert status="warning" mt={4} borderRadius="lg">
          <AlertIcon />
          <Box>
            <AlertTitle fontSize={{ base: 'sm', md: 'md' }}>Importante</AlertTitle>
            <AlertDescription fontSize={{ base: 'sm', md: 'md' }}>
              Restaurar un respaldo reemplazará todos los datos actuales. Asegúrese de crear
              un respaldo antes de restaurar.
            </AlertDescription>
          </Box>
        </Alert>
      </Box>
    </VStack>
  );
}
