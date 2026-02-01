import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  VStack,
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { Customer } from '../../types';
import { es } from '../../i18n/es';

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
}

interface CustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomerFormData) => void;
  customer?: Customer | null;
  isLoading?: boolean;
}

export function CustomerForm({
  isOpen,
  onClose,
  onSubmit,
  customer,
  isLoading = false,
}: CustomerFormProps) {
  const isEditing = !!customer;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    defaultValues: {
      name: '',
      phone: '',
      email: '',
    },
  });

  useEffect(() => {
    if (customer) {
      reset({
        name: customer.name,
        phone: customer.phone || '',
        email: customer.email || '',
      });
    } else {
      reset({
        name: '',
        phone: '',
        email: '',
      });
    }
  }, [customer, reset]);

  const handleFormSubmit = (data: CustomerFormData) => {
    onSubmit(data);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader fontSize="2xl">
          {isEditing ? es.customers.editCustomer : es.customers.addCustomer}
        </ModalHeader>
        <ModalCloseButton size="lg" />

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <ModalBody>
            <VStack spacing={5}>
              {/* Customer Name */}
              <FormControl isInvalid={!!errors.name} isRequired>
                <FormLabel>{es.customers.customerName}</FormLabel>
                <Input
                  {...register('name', {
                    required: es.validation.required,
                    minLength: { value: 2, message: 'Mínimo 2 caracteres' },
                  })}
                  placeholder="Nombre completo del cliente"
                />
                <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
              </FormControl>

              {/* Phone */}
              <FormControl isInvalid={!!errors.phone}>
                <FormLabel>{es.customers.phone}</FormLabel>
                <Input
                  {...register('phone', {
                    pattern: {
                      value: /^[\d\s\-\+\(\)]*$/,
                      message: es.validation.invalidPhone,
                    },
                  })}
                  placeholder="Ej: 55 1234 5678"
                  type="tel"
                />
                <FormErrorMessage>{errors.phone?.message}</FormErrorMessage>
              </FormControl>

              {/* Email */}
              <FormControl isInvalid={!!errors.email}>
                <FormLabel>{es.customers.email}</FormLabel>
                <Input
                  {...register('email', {
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: es.validation.invalidEmail,
                    },
                  })}
                  placeholder="correo@ejemplo.com"
                  type="email"
                />
                <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter gap={4}>
            <Button
              variant="outline"
              size="lg"
              onClick={handleClose}
              isDisabled={isLoading}
            >
              {es.actions.cancel}
            </Button>
            <Button
              type="submit"
              colorScheme="brand"
              size="lg"
              isLoading={isLoading}
            >
              {es.actions.save}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
