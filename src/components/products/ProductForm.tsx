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
  Select,
  Textarea,
  SimpleGrid,
  VStack,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from "@chakra-ui/react";
import { useForm, Controller } from "react-hook-form";
import { useEffect, useRef } from "react";
import { Product, CategoryCode } from "../../types";
import { CATEGORY_OPTIONS } from "../../constants/categories";
import {
  PRODUCT_COLORS,
  UPS_BATCH_OPTIONS,
  DEFAULT_BRANDS,
} from "../../constants/colors";
import { CurrencyInput } from "../common";
import { es } from "../../i18n/es";

interface ProductFormData {
  name: string;
  upsBatch: number;
  quantity: number;
  unitPrice: number;
  category: CategoryCode;
  brand: string;
  color: string;
  size: string;
  description: string;
}

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProductFormData, addAnother?: boolean) => void;
  product?: Product | null;
  isLoading?: boolean;
  initialUpsBatch?: number;
}

export function ProductForm({
  isOpen,
  onClose,
  onSubmit,
  product,
  isLoading = false,
  initialUpsBatch,
}: ProductFormProps) {
  const isEditing = !!product;

  const addAnotherRef = useRef(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormData>({
    defaultValues: {
      name: "",
      upsBatch: initialUpsBatch || 19,
      quantity: 1,
      unitPrice: 0,
      category: "VIB",
      brand: "",
      color: "",
      size: "",
      description: "",
    },
  });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        upsBatch: product.upsBatch,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        category: product.category,
        brand: product.brand || "",
        color: product.color || "",
        size: product.size || "",
        description: product.description || "",
      });
    } else {
      reset({
        name: "",
        upsBatch: initialUpsBatch || 19,
        quantity: 1,
        unitPrice: 0,
        category: "VIB",
        brand: "",
        color: "",
        size: "",
        description: "",
      });
    }
  }, [product, reset, initialUpsBatch]);

  const handleFormSubmit = (data: ProductFormData) => {
    const addAnother = addAnotherRef.current;
    addAnotherRef.current = false;

    onSubmit(data, addAnother);

    // If "Save & Add Another", reset form but keep UPS batch and category
    if (addAnother) {
      const currentUpsBatch = data.upsBatch;
      const currentCategory = data.category;
      reset({
        name: "",
        upsBatch: currentUpsBatch,
        quantity: 1,
        unitPrice: 0,
        category: currentCategory,
        brand: "",
        color: "",
        size: "",
        description: "",
      });
    }
  };

  const handleSaveAndAddAnother = () => {
    addAnotherRef.current = true;
    handleSubmit(handleFormSubmit)();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" isCentered>
      <ModalOverlay />
      <ModalContent mx={4} maxH="90vh" overflowY="auto">
        <ModalHeader fontSize="2xl">
          {isEditing ? es.products.editProduct : es.products.addProduct}
        </ModalHeader>
        <ModalCloseButton size="lg" />

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <ModalBody>
            <VStack spacing={5}>
              {/* Product Name */}
              <FormControl isInvalid={!!errors.name} isRequired>
                <FormLabel>{es.products.productName}</FormLabel>
                <Input
                  {...register("name", {
                    required: es.validation.required,
                    minLength: { value: 2, message: "Mínimo 2 caracteres" },
                  })}
                  placeholder="Ej: Camisa de algodón azul"
                />
                <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
              </FormControl>

              {/* UPS Batch and Category */}
              <SimpleGrid columns={2} spacing={4} w="full">
                <FormControl isInvalid={!!errors.upsBatch} isRequired>
                  <FormLabel>{es.products.upsBatch}</FormLabel>
                  <Select
                    height={"fit-content"}
                    {...register("upsBatch", { valueAsNumber: true })}
                    size="lg"
                  >
                    {UPS_BATCH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isInvalid={!!errors.category} isRequired>
                  <FormLabel>{es.products.category}</FormLabel>
                  <Select
                    height={"fit-content"}
                    {...register("category")}
                    size={{ base: "lg", md: "lg" }}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>

              {/* Quantity and Price */}
              <SimpleGrid columns={2} spacing={4} w="full">
                <FormControl isInvalid={!!errors.quantity} isRequired>
                  <FormLabel>{es.products.quantity}</FormLabel>
                  <Controller
                    name="quantity"
                    control={control}
                    rules={{
                      required: es.validation.required,
                      min: { value: 0, message: es.validation.positiveNumber },
                    }}
                    render={({ field }) => (
                      <NumberInput
                        min={0}
                        value={field.value}
                        onChange={(_, val) => field.onChange(val || 0)}
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    )}
                  />
                  <FormErrorMessage>
                    {errors.quantity?.message}
                  </FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.unitPrice} isRequired>
                  <FormLabel>{es.products.unitPrice}</FormLabel>
                  <Controller
                    name="unitPrice"
                    control={control}
                    rules={{
                      required: es.validation.required,
                      min: { value: 0, message: es.validation.positiveNumber },
                    }}
                    render={({ field }) => (
                      <CurrencyInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="0.00"
                      />
                    )}
                  />
                  <FormErrorMessage>
                    {errors.unitPrice?.message}
                  </FormErrorMessage>
                </FormControl>
              </SimpleGrid>

              {/* Brand and Color */}
              <SimpleGrid columns={2} spacing={4} w="full">
                <FormControl>
                  <FormLabel>{es.products.brand}</FormLabel>
                  <Input
                    {...register("brand")}
                    list="brands-list"
                    placeholder="Ej: Nike, Samsung"
                  />
                  <datalist id="brands-list">
                    {DEFAULT_BRANDS.map((brand) => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>
                </FormControl>

                <FormControl>
                  <FormLabel>{es.products.color}</FormLabel>
                  <Select
                    height={"fit-content"}
                    {...register("color")}
                    placeholder="Seleccionar color"
                    size="lg"
                  >
                    {PRODUCT_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>

              {/* Size */}
              <FormControl>
                <FormLabel>{es.products.size}</FormLabel>
                <Input {...register("size")} placeholder="Ej: M, 32, Grande" />
              </FormControl>

              {/* Description */}
              <FormControl>
                <FormLabel>{es.products.description}</FormLabel>
                <Textarea
                  {...register("description")}
                  placeholder="Observaciones adicionales..."
                  rows={3}
                />
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter gap={2} flexWrap="wrap" justifyContent="flex-end">
            <Button
              variant="outline"
              size="lg"
              onClick={handleClose}
              isDisabled={isLoading}
            >
              {es.actions.cancel}
            </Button>
            {!isEditing && (
              <Button
                variant="outline"
                colorScheme="brand"
                size="lg"
                onClick={handleSaveAndAddAnother}
                isLoading={isLoading}
              >
                Guardar y Agregar Otro
              </Button>
            )}
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
