import { useMemo, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { useSatKeyStore } from '../../store/satKeyStore';
import { CategoryCode } from '../../types';
import { getSatKeyOptionsForCategory } from '../../utils/satKeyHelpers';
import { AutocompleteSelect } from './AutocompleteSelect';

export interface SatKeySnapshotValue {
  satKeyId?: string;
  satKeyCode?: string;
  satKeyDescription?: string;
}

interface SatKeySelectorProps {
  value: SatKeySnapshotValue;
  category?: string;
  onChange: (value: SatKeySnapshotValue) => void;
  label?: string;
}

export function SatKeySelector({
  value,
  category,
  onChange,
  label = 'Clave SAT',
}: SatKeySelectorProps) {
  const toast = useToast();
  const { satKeys, satCategorySuggestions, createAndConfirmSatKey } = useSatKeyStore();
  const [isAdding, setIsAdding] = useState(false);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const historicalMissing = !!value.satKeyId &&
    !satKeys.some((satKey) => satKey.id === value.satKeyId);

  const options = useMemo(() => {
    const catalogOptions = getSatKeyOptionsForCategory(
      satKeys,
      satCategorySuggestions,
      (category || '') as CategoryCode | '',
    );
    if (!historicalMissing || !value.satKeyId) return catalogOptions;

    return [{
      value: value.satKeyId,
      label: `Histórica no disponible - ${value.satKeyCode || value.satKeyId}${
        value.satKeyDescription ? ` - ${value.satKeyDescription}` : ''
      }`,
    }, ...catalogOptions];
  }, [category, historicalMissing, satCategorySuggestions, satKeys, value]);

  const handleSelection = (selectedValue: string | number | '') => {
    if (!selectedValue) {
      onChange({});
      return;
    }
    const selectedId = String(selectedValue);
    const selected = satKeys.find((satKey) => satKey.id === selectedId);
    if (selected) {
      onChange({
        satKeyId: selected.id,
        satKeyCode: selected.code,
        satKeyDescription: selected.description,
      });
      return;
    }
    // Keep an unavailable historical snapshot unchanged. The RPC independently
    // verifies that the same snapshot already belongs to this sale.
    if (selectedId === value.satKeyId) onChange(value);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createAndConfirmSatKey({ code, description });
      onChange({
        satKeyId: result.satKey.id,
        satKeyCode: result.satKey.code,
        satKeyDescription: result.satKey.description,
      });
      setCode('');
      setDescription('');
      setIsAdding(false);
      toast({
        title: result.wasExisting ? 'Clave SAT existente seleccionada' : 'Clave SAT registrada',
        description: `${result.satKey.code} - ${result.satKey.description}`,
        status: result.hasPendingReconciliation ? 'warning' : 'success',
        duration: result.hasPendingReconciliation ? 7000 : 4000,
        isClosable: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const detail = message === 'sat_key_code_invalid'
        ? 'Ingresa una clave SAT de 8 dígitos.'
        : message === 'sat_key_description_required'
          ? 'Ingresa una descripción para la clave SAT.'
          : message === 'sat_key_connection_required'
            ? 'Necesitas conexión para registrar una nueva clave SAT.'
            : 'No se pudo confirmar la clave SAT en Supabase.';
      toast({
        title: 'No se registró la clave SAT',
        description: detail,
        status: 'error',
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <FormControl>
      <FormLabel fontSize="sm">{label}</FormLabel>
      <AutocompleteSelect
        options={options}
        value={value.satKeyId || ''}
        onChange={handleSelection}
        placeholder="Buscar por clave o descripción"
      />
      <HStack mt={2} spacing={3} flexWrap="wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAdding((current) => !current)}
          isDisabled={isCreating}
        >
          Agregar nueva clave SAT
        </Button>
        <Text fontSize="xs" color="gray.500">
          Se confirma en Supabase antes de usarla.
        </Text>
      </HStack>

      {isAdding && (
        <Box mt={3} p={4} bg="blue.50" borderWidth="1px" borderColor="blue.100" borderRadius="lg">
          <VStack align="stretch" spacing={3}>
            <Text fontWeight="semibold">Registrar y usar nueva clave SAT</Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Clave SAT (8 dígitos)</FormLabel>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  maxLength={8}
                  isDisabled={isCreating}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Descripción</FormLabel>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  isDisabled={isCreating}
                />
              </FormControl>
            </SimpleGrid>
            <HStack justify="flex-end">
              <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                colorScheme="brand"
                onClick={handleCreate}
                isLoading={isCreating}
                loadingText="Verificando"
                isDisabled={!/^\d{8}$/.test(code) || !description.trim()}
              >
                Verificar y usar
              </Button>
            </HStack>
          </VStack>
        </Box>
      )}

      {historicalMissing && (
        <Alert status="warning" mt={2} borderRadius="md" py={2} fontSize="sm">
          <AlertIcon />
          La clave histórica ya no está disponible. Se conservará mientras no la cambies.
        </Alert>
      )}
    </FormControl>
  );
}
