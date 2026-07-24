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
  Textarea,
  SimpleGrid,
  VStack,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Box,
  HStack,
  Text,
  Alert,
  AlertIcon,
  useToast,
} from "@chakra-ui/react";
import { useForm, Controller } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { Product, CategoryCode } from "../../types";
import { CATEGORY_OPTIONS } from "../../constants/categories";
import {
  PRODUCT_COLORS,
  UPS_BATCH_OPTIONS,
  DEFAULT_BRANDS,
} from "../../constants/colors";
import { CurrencyInput, AutocompleteSelect } from "../common";
import { es } from "../../i18n/es";
import { getReviewQty } from "../../utils/productHelpers";
import { useSatKeyStore } from "../../store/satKeyStore";
import { getSatKeyOptionsForCategory } from "../../utils/satKeyHelpers";

interface ProductFormData {
  name: string;
  upsBatch: number;
  quantity: number;
  unitPrice: number;
  category: CategoryCode;
  satKeyId: string;
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
  const { satKeys, satCategorySuggestions, createAndConfirmSatKey } = useSatKeyStore();
  const toast = useToast();
  const [isAddingSatKey, setIsAddingSatKey] = useState(false);
  const [newSatCode, setNewSatCode] = useState("");
  const [newSatDescription, setNewSatDescription] = useState("");
  const [isCreatingSatKey, setIsCreatingSatKey] = useState(false);
  const productSatKeyMissing =
    !!product?.satKeyId &&
    satKeys.length > 0 &&
    !satKeys.some((satKey) => satKey.id === product.satKeyId);
  const reviewQty = product ? getReviewQty(product) : 0;
  const otherQty = product
    ? product.donatedQty + product.lostQty + product.expiredQty
    : 0;

  const addAnotherRef = useRef(false);
  const initializedFormKeyRef = useRef<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    defaultValues: {
      name: "",
      upsBatch: initialUpsBatch || 19,
      quantity: 1,
      unitPrice: 0,
      category: "VIB",
      satKeyId: "",
      brand: "",
      color: "",
      size: "",
      description: "",
    },
  });
  const watchedQuantity = watch("quantity");
  const watchedCategory = watch("category");
  const satKeyOptions = useMemo(
    () => getSatKeyOptionsForCategory(
      satKeys,
      satCategorySuggestions,
      watchedCategory || "",
    ),
    [satCategorySuggestions, satKeys, watchedCategory],
  );

  useEffect(() => {
    if (!isOpen) {
      initializedFormKeyRef.current = null;
      return;
    }

    const formKey = product?.id ?? "new-product";
    if (initializedFormKeyRef.current === formKey) return;
    initializedFormKeyRef.current = formKey;

    if (product) {
      reset({
        name: product.name,
        upsBatch: product.upsBatch,
        quantity: product.availableQty,
        unitPrice: product.unitPrice,
        category: product.category,
        // Preserve the stored id even when the SAT catalog arrives late. This
        // prevents an edit from accidentally clearing a valid remote key.
        satKeyId: product.satKeyId || "",
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
        satKeyId: "",
        brand: "",
        color: "",
        size: "",
        description: "",
      });
    }
  }, [isOpen, product, reset, initialUpsBatch]);

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
        satKeyId: data.satKeyId,
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
    setIsAddingSatKey(false);
    setNewSatCode("");
    setNewSatDescription("");
    reset();
    onClose();
  };

  const handleCreateSatKey = async () => {
    setIsCreatingSatKey(true);
    try {
      const result = await createAndConfirmSatKey({
        code: newSatCode,
        description: newSatDescription,
      });
      setValue("satKeyId", result.satKey.id, { shouldDirty: true });
      setNewSatCode("");
      setNewSatDescription("");
      setIsAddingSatKey(false);
      toast(result.hasPendingReconciliation
        ? {
            title: "Clave SAT registrada con pendientes locales",
            description: `${result.satKey.code} - ${result.satKey.description}. Se usará en este producto; revisa la sincronización de cambios anteriores.`,
            status: "warning",
            duration: 7000,
            isClosable: true,
          }
        : {
            title: result.wasExisting ? "Clave SAT existente seleccionada" : "Clave SAT registrada",
            description: `${result.satKey.code} - ${result.satKey.description}`,
            status: "success",
            duration: 4000,
            isClosable: true,
          });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const description = message === "sat_key_code_invalid"
        ? "Ingresa una clave SAT de 8 dígitos."
        : message === "sat_key_description_required"
          ? "Ingresa una descripción para la clave SAT."
          : message === "sat_key_connection_required"
            ? "Necesitas conexión para registrar una nueva clave SAT."
            : message === "sat_key_confirm_timeout"
              ? "La confirmación tardó demasiado. Revisa tu conexión e inténtalo de nuevo."
              : "No se pudo confirmar la clave SAT en Supabase. Revisa tu conexión e inténtalo de nuevo.";
      toast({
        title: "No se registró la clave SAT",
        description,
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setIsCreatingSatKey(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size={{ base: "full", md: "xl" }}
      isCentered
      scrollBehavior="inside"
      motionPreset="slideInBottom"
    >
      <ModalOverlay />
      <ModalContent
        mx={{ base: 2, md: 4 }}
        my={{ base: 2, md: 6 }}
        maxH={{ base: "calc(100dvh - 16px)", md: "calc(100vh - 64px)" }}
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        <ModalHeader fontSize="2xl">
          {isEditing ? es.products.editProduct : es.products.addProduct}
        </ModalHeader>
        <ModalCloseButton size="lg" />

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        >
          <ModalBody overflowY="auto" flex="1" minH={0}>
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
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full">
                <FormControl isInvalid={!!errors.upsBatch} isRequired>
                  <FormLabel>{es.products.upsBatch}</FormLabel>
                  <Controller
                    name="upsBatch"
                    control={control}
                    rules={{ required: es.validation.required }}
                    render={({ field }) => (
                      <AutocompleteSelect
                        options={UPS_BATCH_OPTIONS}
                        value={field.value}
                        onChange={(val) => field.onChange(val ? Number(val) : '')}
                        placeholder="Buscar UPS..."
                        size="md"
                      />
                    )}
                  />
                  <FormErrorMessage>{errors.upsBatch?.message}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.category} isRequired>
                  <FormLabel>{es.products.category}</FormLabel>
                  <Controller
                    name="category"
                    control={control}
                    rules={{ required: es.validation.required }}
                    render={({ field }) => (
                      <AutocompleteSelect
                        options={CATEGORY_OPTIONS}
                        value={field.value}
                        onChange={(val) => field.onChange(val as CategoryCode)}
                        placeholder="Buscar categoría..."
                        size="md"
                      />
                    )}
                  />
                  <FormErrorMessage>{errors.category?.message}</FormErrorMessage>
                </FormControl>
              </SimpleGrid>

              {/* Quantity and Price */}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full">
                <FormControl isInvalid={!!errors.quantity} isRequired>
                  <FormLabel>
                    {isEditing ? es.products.availableStock : es.products.initialQuantity}
                  </FormLabel>
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
                  {isEditing && product && (
                    <Box
                      mt={3}
                      p={3}
                      bg="gray.50"
                      borderRadius="md"
                      borderWidth="1px"
                      borderColor="gray.100"
                    >
                      <HStack spacing={4} flexWrap="wrap" color="gray.600" fontSize="sm">
                        <Text>
                          <Text as="span" fontWeight="semibold" color="gray.700">
                            {es.products.currentTotal}:
                          </Text>{" "}
                          {product.quantity}
                        </Text>
                        <Text>
                          <Text as="span" fontWeight="semibold" color="gray.700">
                            {es.products.availableTotal}:
                          </Text>{" "}
                          {watchedQuantity ?? product.availableQty}
                        </Text>
                        <Text>
                          <Text as="span" fontWeight="semibold" color="gray.700">
                            {es.products.soldQuantity}:
                          </Text>{" "}
                          {product.soldQty}
                        </Text>
                        {reviewQty > 0 && (
                          <Text>
                            <Text as="span" fontWeight="semibold" color="gray.700">
                              {es.products.reviewQuantity}:
                            </Text>{" "}
                            {reviewQty}
                          </Text>
                        )}
                        {otherQty > 0 && (
                          <Text>
                            <Text as="span" fontWeight="semibold" color="gray.700">
                              {es.products.otherQuantity}:
                            </Text>{" "}
                            {otherQty}
                          </Text>
                        )}
                      </HStack>
                    </Box>
                  )}
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

              <FormControl>
                <FormLabel>Clave SAT</FormLabel>
                <Controller
                  name="satKeyId"
                  control={control}
                  render={({ field }) => (
                    <AutocompleteSelect
                      options={satKeyOptions}
                      value={field.value || ""}
                      onChange={(val) => field.onChange(val ? String(val) : "")}
                      placeholder="Sin clave SAT"
                      size="md"
                    />
                  )}
                />
                <HStack mt={3} spacing={3} align="center" flexWrap="wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingSatKey((current) => !current)}
                    isDisabled={isCreatingSatKey}
                  >
                    Agregar nueva clave SAT
                  </Button>
                  <Text fontSize="sm" color="gray.600">
                    Se verifica en Supabase antes de usarla en el producto.
                  </Text>
                </HStack>
                {isAddingSatKey && (
                  <Box
                    mt={3}
                    p={4}
                    bg="blue.50"
                    borderWidth="1px"
                    borderColor="blue.100"
                    borderRadius="lg"
                  >
                    <VStack align="stretch" spacing={3}>
                      <Text fontWeight="semibold" color="gray.800">
                        Registrar y usar nueva clave SAT
                      </Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                        <FormControl isRequired>
                          <FormLabel>Clave SAT (8 dígitos)</FormLabel>
                          <Input
                            value={newSatCode}
                            onChange={(event) => setNewSatCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                            inputMode="numeric"
                            maxLength={8}
                            placeholder="Ej: 53103000"
                            isDisabled={isCreatingSatKey}
                          />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>Descripción</FormLabel>
                          <Input
                            value={newSatDescription}
                            onChange={(event) => setNewSatDescription(event.target.value)}
                            placeholder="Ej: Ropa"
                            isDisabled={isCreatingSatKey}
                          />
                        </FormControl>
                      </SimpleGrid>
                      <HStack justify="flex-end" spacing={3} flexWrap="wrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsAddingSatKey(false)}
                          isDisabled={isCreatingSatKey}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCreateSatKey}
                          isLoading={isCreatingSatKey}
                          loadingText="Verificando"
                          isDisabled={
                            !/^\d{8}$/.test(newSatCode) ||
                            newSatDescription.trim().length === 0
                          }
                        >
                          Verificar y usar
                        </Button>
                      </HStack>
                    </VStack>
                  </Box>
                )}
                {productSatKeyMissing && (
                  <Alert status="warning" mt={2} borderRadius="md" py={2}>
                    <AlertIcon />
                    La clave SAT anterior no está disponible localmente. Se conservará hasta que elijas otra.
                  </Alert>
                )}
              </FormControl>

              {/* Brand and Color */}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full">
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
                  <Controller
                    name="color"
                    control={control}
                    render={({ field }) => (
                      <AutocompleteSelect
                        options={PRODUCT_COLORS.map((color) => ({
                          value: color,
                          label: color,
                        }))}
                        value={field.value || ""}
                        onChange={(val) =>
                          field.onChange(val === "" ? "" : String(val))
                        }
                        placeholder="Seleccionar color"
                        size="md"
                      />
                    )}
                  />
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

          <ModalFooter
            gap={2}
            flexWrap="wrap"
            justifyContent="flex-end"
            borderTopWidth="1px"
            borderColor="gray.100"
            bg="white"
          >
            <Button
              variant="outline"
              size="lg"
              onClick={handleClose}
              isDisabled={isLoading || isCreatingSatKey}
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
                isDisabled={isCreatingSatKey}
              >
                Guardar y Agregar Otro
              </Button>
            )}
            <Button
              type="submit"
              colorScheme="brand"
              size="lg"
              isLoading={isLoading}
              isDisabled={isCreatingSatKey}
            >
              {es.actions.save}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
