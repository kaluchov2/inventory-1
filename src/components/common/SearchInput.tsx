import {
  InputGroup,
  InputLeftElement,
  Input,
  Icon,
  InputRightElement,
  IconButton,
} from '@chakra-ui/react';
import { FiSearch, FiX } from 'react-icons/fi';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'md' | 'lg';
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  size = 'lg',
}: SearchInputProps) {
  return (
    <InputGroup size={size}>
      <InputLeftElement pointerEvents="none" h="full">
        <Icon as={FiSearch} color="gray.400" boxSize={5} />
      </InputLeftElement>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        bg="white"
        pl={12}
        pr={value ? 12 : 4}
      />
      {value && (
        <InputRightElement h="full">
          <IconButton
            aria-label="Limpiar búsqueda"
            icon={<Icon as={FiX} />}
            size="sm"
            variant="ghost"
            onClick={() => onChange('')}
          />
        </InputRightElement>
      )}
    </InputGroup>
  );
}
