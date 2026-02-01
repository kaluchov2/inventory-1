import {
  InputGroup,
  InputLeftElement,
  Input,
  Text,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { parseCurrencyInput } from '../../utils/formatters';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  size?: 'md' | 'lg';
  isDisabled?: boolean;
  isInvalid?: boolean;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  size = 'md',
  isDisabled = false,
  isInvalid = false,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value > 0 ? value.toFixed(2) : '');
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/[^0-9.]/g, '');
    setDisplayValue(input);
    const numericValue = parseCurrencyInput(input);
    onChange(numericValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (value > 0) {
      setDisplayValue(value.toString());
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setDisplayValue(value > 0 ? value.toFixed(2) : '');
  };

  return (
    <InputGroup size={size}>
      <InputLeftElement pointerEvents="none" h="full">
        <Text fontWeight="bold" color="gray.500" fontSize="lg">
          $
        </Text>
      </InputLeftElement>
      <Input
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        type="text"
        inputMode="decimal"
        bg="white"
        pl={10}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
      />
    </InputGroup>
  );
}
