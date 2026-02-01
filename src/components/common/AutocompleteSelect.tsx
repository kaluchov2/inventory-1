import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Input,
  InputGroup,
  InputRightElement,
  List,
  ListItem,
  Icon,
  Text,
  useOutsideClick,
} from '@chakra-ui/react';
import { FiChevronDown, FiX } from 'react-icons/fi';

export interface AutocompleteOption {
  value: string | number;
  label: string;
}

interface AutocompleteSelectProps {
  options: AutocompleteOption[];
  value: string | number | '';
  onChange: (value: string | number | '') => void;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AutocompleteSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  size = 'md',
}: AutocompleteSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on input
  const filteredOptions = useMemo(() => {
    if (!inputValue) return options;
    const search = inputValue.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(search));
  }, [options, inputValue]);

  // Close on outside click
  useOutsideClick({
    ref: containerRef,
    handler: () => {
      setIsOpen(false);
      setInputValue('');
    },
  });

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    setInputValue('');
  };

  const handleSelect = (option: AutocompleteOption) => {
    onChange(option.value);
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setInputValue('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((i) =>
            i < filteredOptions.length - 1 ? i + 1 : i
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setInputValue('');
        inputRef.current?.blur();
        break;
      case 'Tab':
        setIsOpen(false);
        setInputValue('');
        break;
    }
  };

  const displayValue = isOpen
    ? inputValue
    : selectedOption
      ? selectedOption.label
      : '';

  return (
    <Box ref={containerRef} position="relative" w="full">
      <InputGroup size={size}>
        <Input
          ref={inputRef}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          bg="white"
          pr={value ? '4.5rem' : '2.5rem'}
          color={!isOpen && selectedOption ? 'inherit' : 'inherit'}
          _placeholder={{ color: 'gray.400' }}
        />
        <InputRightElement w={value ? '4.5rem' : '2.5rem'}>
          {value && (
            <Icon
              as={FiX}
              color="gray.400"
              cursor="pointer"
              mr={2}
              onClick={handleClear}
              _hover={{ color: 'gray.600' }}
            />
          )}
          <Icon
            as={FiChevronDown}
            color="gray.400"
            transform={isOpen ? 'rotate(180deg)' : 'none'}
            transition="transform 0.2s"
          />
        </InputRightElement>
      </InputGroup>

      {isOpen && (
        <Box
          position="absolute"
          top="100%"
          left={0}
          right={0}
          zIndex={1400}
          bg="white"
          border="1px"
          borderColor="gray.200"
          borderRadius="md"
          boxShadow="lg"
          maxH="200px"
          overflowY="auto"
          mt={1}
        >
          <List ref={listRef} spacing={0}>
            {filteredOptions.length === 0 ? (
              <ListItem px={3} py={2}>
                <Text color="gray.500" fontSize="sm">
                  No se encontraron opciones
                </Text>
              </ListItem>
            ) : (
              filteredOptions.map((option, index) => (
                <ListItem
                  key={option.value}
                  px={3}
                  py={2}
                  cursor="pointer"
                  bg={
                    index === highlightedIndex
                      ? 'blue.50'
                      : option.value === value
                        ? 'gray.50'
                        : 'white'
                  }
                  _hover={{ bg: 'blue.50' }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <Text
                    fontSize="sm"
                    fontWeight={option.value === value ? 'medium' : 'normal'}
                  >
                    {option.label}
                  </Text>
                </ListItem>
              ))
            )}
          </List>
        </Box>
      )}
    </Box>
  );
}
