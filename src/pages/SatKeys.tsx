import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { FiEdit2, FiHash, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi';
import { ConfirmDialog, EmptyState, SearchInput } from '../components/common';
import { useProductStore } from '../store/productStore';
import { useSatKeyStore } from '../store/satKeyStore';
import { SatKey } from '../types';

function getSatKeyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'sat_key_code_duplicate') {
    return 'Ya existe una clave SAT con ese codigo.';
  }
  if (message === 'sat_key_code_required') {
    return 'Ingrese una clave SAT.';
  }
  if (message === 'sat_key_description_required') {
    return 'Ingrese una descripcion para la clave SAT.';
  }
  return 'No se pudo guardar la clave SAT.';
}

export function SatKeys() {
  const toast = useToast();
  const {
    satKeys,
    filters,
    addSatKey,
    updateSatKey,
    deleteSatKey,
    setFilters,
    getFilteredSatKeys,
  } = useSatKeyStore();
  const { products } = useProductStore();

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [editingSatKey, setEditingSatKey] = useState<SatKey | null>(null);
  const [satKeyToDelete, setSatKeyToDelete] = useState<SatKey | null>(null);

  const filteredSatKeys = getFilteredSatKeys();
  const usageCountBySatKey = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      if (!product.satKeyId) return;
      counts.set(product.satKeyId, (counts.get(product.satKeyId) || 0) + 1);
    });
    return counts;
  }, [products]);

  const resetForm = () => {
    setCode('');
    setDescription('');
    setEditingSatKey(null);
  };

  const handleSubmit = () => {
    try {
      if (editingSatKey) {
        updateSatKey(editingSatKey.id, { code, description });
        toast({
          title: 'Clave SAT actualizada',
          status: 'success',
          duration: 2500,
        });
      } else {
        addSatKey({ code, description });
        toast({
          title: 'Clave SAT agregada',
          status: 'success',
          duration: 2500,
        });
      }
      resetForm();
    } catch (error) {
      toast({
        title: getSatKeyErrorMessage(error),
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    }
  };

  const handleEdit = (satKey: SatKey) => {
    setEditingSatKey(satKey);
    setCode(satKey.code);
    setDescription(satKey.description);
  };

  const handleDeleteClick = (satKey: SatKey) => {
    const usedBy = usageCountBySatKey.get(satKey.id) || 0;
    if (usedBy > 0) {
      toast({
        title: 'No se puede eliminar',
        description: `Esta clave esta asignada a ${usedBy} producto(s). Cambie esos productos antes de eliminarla.`,
        status: 'warning',
        duration: 4500,
        isClosable: true,
      });
      return;
    }
    setSatKeyToDelete(satKey);
  };

  const handleConfirmDelete = () => {
    if (!satKeyToDelete) return;
    deleteSatKey(satKeyToDelete.id);
    toast({
      title: 'Clave SAT eliminada',
      status: 'success',
      duration: 2500,
    });
    setSatKeyToDelete(null);
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      <Flex
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        gap={3}
      >
        <Box>
          <Heading size={{ base: 'lg', md: 'xl' }}>Claves SAT</Heading>
          <Text color="gray.500" mt={1}>
            Catalogo manual de claves para clasificar productos.
          </Text>
        </Box>
        <Badge
          colorScheme={satKeys.length > 0 ? 'blue' : 'gray'}
          alignSelf={{ base: 'flex-start', md: 'center' }}
        >
          {satKeys.length} clave(s)
        </Badge>
      </Flex>

      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <HStack spacing={2} mb={4}>
          <Icon as={editingSatKey ? FiEdit2 : FiPlus} color="brand.500" />
          <Heading size="md">
            {editingSatKey ? 'Editar clave SAT' : 'Agregar clave SAT'}
          </Heading>
        </HStack>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl isRequired>
            <FormLabel>Clave</FormLabel>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Ej: 02002"
              autoComplete="off"
            />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Descripcion</FormLabel>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ej: Ropa"
              autoComplete="off"
            />
          </FormControl>
        </SimpleGrid>

        <HStack mt={4} spacing={3} flexWrap="wrap">
          <Button
            leftIcon={<Icon as={editingSatKey ? FiSave : FiPlus} />}
            onClick={handleSubmit}
            isDisabled={!code.trim() || !description.trim()}
          >
            {editingSatKey ? 'Guardar cambios' : 'Agregar clave'}
          </Button>
          {editingSatKey && (
            <Button
              variant="outline"
              colorScheme="gray"
              leftIcon={<Icon as={FiX} />}
              onClick={resetForm}
            >
              Cancelar edicion
            </Button>
          )}
        </HStack>
      </Box>

      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <VStack spacing={4} align="stretch">
          <SearchInput
            value={filters.search}
            onChange={(search) => setFilters({ search })}
            placeholder="Buscar por clave o descripcion..."
          />

          {filteredSatKeys.length === 0 ? (
            <EmptyState
              title="No hay claves SAT"
              message="Agregue una clave para asignarla a productos."
            />
          ) : (
            <Box overflowX="auto">
              <Table>
                <Thead bg="gray.50">
                  <Tr>
                    <Th>Clave</Th>
                    <Th>Descripcion</Th>
                    <Th isNumeric>Productos</Th>
                    <Th w="120px">Acciones</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredSatKeys.map((satKey) => {
                    const usageCount = usageCountBySatKey.get(satKey.id) || 0;
                    return (
                      <Tr key={satKey.id} _hover={{ bg: 'gray.50' }}>
                        <Td>
                          <HStack spacing={2}>
                            <Icon as={FiHash} color="brand.500" />
                            <Text fontWeight="bold" fontFamily="mono">
                              {satKey.code}
                            </Text>
                          </HStack>
                        </Td>
                        <Td>{satKey.description}</Td>
                        <Td isNumeric>
                          <Badge colorScheme={usageCount > 0 ? 'green' : 'gray'}>
                            {usageCount}
                          </Badge>
                        </Td>
                        <Td>
                          <HStack spacing={1}>
                            <IconButton
                              aria-label="Editar clave SAT"
                              icon={<Icon as={FiEdit2} />}
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(satKey)}
                            />
                            <IconButton
                              aria-label="Eliminar clave SAT"
                              icon={<Icon as={FiTrash2} />}
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => handleDeleteClick(satKey)}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
        </VStack>
      </Box>

      <ConfirmDialog
        isOpen={!!satKeyToDelete}
        onClose={() => setSatKeyToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar clave SAT"
        message={
          satKeyToDelete
            ? `¿Seguro que desea eliminar la clave ${satKeyToDelete.code}?`
            : ''
        }
        confirmText="Eliminar"
      />
    </VStack>
  );
}
