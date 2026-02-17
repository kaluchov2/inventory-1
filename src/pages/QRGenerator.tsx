import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Icon,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
  ButtonGroup,
  Flex,
  Badge,
  useToast,
  Checkbox,
  IconButton,
} from '@chakra-ui/react';
import { QRCodeSVG } from 'qrcode.react';
import { FiPrinter, FiEye, FiGrid, FiPlus, FiMinus, FiRefreshCw } from 'react-icons/fi';
import { generateBarcode } from '../utils/barcodeGenerator';
import { UPS_BATCH_OPTIONS } from '../constants/colors';

const NUMBERED_UPS_THRESHOLD = 20;
import { AutocompleteSelect } from '../components/common';
import { useProductStore } from '../store/productStore';
import { formatCurrency } from '../utils/formatters';
import type { Product } from '../types';

type QRSize = 'T' | 'S' | 'M' | 'L';
type Mode = 'generate' | 'reprint';

const SIZE_CONFIG: Record<QRSize, { qrSize: number; fontSize: string; padding: number }> = {
  T: { qrSize: 70, fontSize: '9px', padding: 4 },
  S: { qrSize: 80, fontSize: '10px', padding: 8 },
  M: { qrSize: 120, fontSize: '12px', padding: 12 },
  L: { qrSize: 160, fontSize: '14px', padding: 16 },
};

export function QRGenerator() {
  const toast = useToast();
  const [selectedUps, setSelectedUps] = useState<number | ''>('');
  const [quantity, setQuantity] = useState(40);
  const [startSequence, setStartSequence] = useState(1);
  const [size, setSize] = useState<QRSize>('M');
  const [showPreview, setShowPreview] = useState(false);
  const [mode, setMode] = useState<Mode>('generate');
  // Map of product.id → number of copies
  const [reprintSelections, setReprintSelections] = useState<Map<string, number>>(new Map());

  const { getProductByBarcode, getProductsByDrop, products } = useProductStore();

  // Generate barcodes based on settings
  const generatedCodes = useMemo(() => {
    if (!selectedUps || quantity <= 0) return [];

    const codes: string[] = [];
    const isNumbered = selectedUps >= NUMBERED_UPS_THRESHOLD;
    for (let i = startSequence; i < startSequence + quantity; i++) {
      const barcode = isNumbered
        ? generateBarcode('numbered', String(selectedUps), i)
        : generateBarcode('legacy', String(selectedUps), undefined, i);
      codes.push(barcode);
    }
    return codes;
  }, [selectedUps, quantity, startSequence]);

  // Look up products for each generated barcode
  // getProductByBarcode handles alternate format fallback (numbered <-> legacy)
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const code of generatedCodes) {
      const product = getProductByBarcode(code);
      if (product) map.set(code, product);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedCodes, products]);

  // Products available for reprint in the selected UPS
  const reprintProducts = useMemo(() => {
    if (!selectedUps) return [];
    return getProductsByDrop(String(selectedUps))
      .filter((p) => !!p.barcode)
      .sort((a, b) => (a.productNumber ?? a.dropSequence ?? 0) - (b.productNumber ?? b.dropSequence ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUps, products]);

  // Count of products in this UPS that have no barcode (for warning)
  const excludedCount = useMemo(() => {
    if (!selectedUps) return 0;
    return getProductsByDrop(String(selectedUps)).filter((p) => !p.barcode).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUps, products]);

  // Unified print data for both modes
  const printCodes = useMemo((): Array<{ barcode: string; product?: Product }> => {
    if (mode === 'generate') {
      return generatedCodes.map((code) => ({
        barcode: code,
        product: productMap.get(code),
      }));
    }
    // Reprint mode: expand selections into repeated entries
    const entries: Array<{ barcode: string; product?: Product }> = [];
    for (const [productId, copies] of reprintSelections) {
      const product = reprintProducts.find((p) => p.id === productId);
      if (product?.barcode) {
        for (let i = 0; i < copies; i++) {
          entries.push({ barcode: product.barcode, product });
        }
      }
    }
    return entries;
  }, [mode, generatedCodes, productMap, reprintSelections, reprintProducts]);

  const totalReprintLabels = useMemo(() => {
    let total = 0;
    for (const copies of reprintSelections.values()) {
      total += copies;
    }
    return total;
  }, [reprintSelections]);

  const handleModeChange = useCallback((newMode: Mode) => {
    setMode(newMode);
    setShowPreview(false);
    setReprintSelections(new Map());
  }, []);

  const handleUpsChange = useCallback((val: string | number) => {
    setSelectedUps(val ? Number(val) : '');
    setShowPreview(false);
    setReprintSelections(new Map());
  }, []);

  const toggleProduct = useCallback((productId: string) => {
    setReprintSelections((prev) => {
      const next = new Map(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.set(productId, 1);
      }
      return next;
    });
  }, []);

  const setCopies = useCallback((productId: string, copies: number) => {
    const clamped = Math.max(1, Math.min(20, copies));
    setReprintSelections((prev) => {
      const next = new Map(prev);
      next.set(productId, clamped);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const next = new Map<string, number>();
    for (const p of reprintProducts) {
      next.set(p.id, reprintSelections.get(p.id) ?? 1);
    }
    setReprintSelections(next);
  }, [reprintProducts, reprintSelections]);

  const deselectAll = useCallback(() => {
    setReprintSelections(new Map());
  }, []);

  const handleGeneratePreview = () => {
    if (!selectedUps) {
      toast({
        title: 'Selecciona un UPS',
        description: 'Debes seleccionar un número de UPS para generar códigos',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (mode === 'reprint' && reprintSelections.size === 0) {
      toast({
        title: 'Selecciona productos',
        description: 'Debes seleccionar al menos un producto para reimprimir',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    setShowPreview(true);
  };

  const handlePrint = () => {
    if (printCodes.length === 0) return;

    const { qrSize, fontSize, padding } = SIZE_CONFIG[size];
    const allBarcodes = printCodes.map((c) => c.barcode);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Error',
        description: 'No se pudo abrir la ventana de impresión',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const isThermal = size === 'T';
    const columns = isThermal ? 2 : size === 'S' ? 5 : size === 'M' ? 4 : 3;

    const headerText = mode === 'reprint'
      ? `Reimpresión - UPS ${selectedUps}, ${reprintSelections.size} productos, ${totalReprintLabels} etiquetas`
      : `Del ${allBarcodes[0]} al ${allBarcodes[allBarcodes.length - 1]} (${allBarcodes.length} códigos)`;

    const thermalStyles = `
      @page {
        size: 100mm auto;
        margin: 1mm 2mm;
      }
      body {
        font-family: Arial, sans-serif;
        padding: 0;
        margin: 0;
        width: 100mm;
      }
      .header { display: none; }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1mm;
      }
      .qr-item {
        text-align: center;
        padding: 2mm 1mm;
        border-bottom: 1px dashed #aaa;
        break-inside: avoid;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .qr-item canvas, .qr-item svg {
        display: block;
        margin: 0 auto;
      }
      .qr-text {
        font-family: monospace;
        font-size: 8px;
        font-weight: bold;
        margin-top: 1mm;
        letter-spacing: 0.5px;
      }
      .product-name { display: none; }
      .product-price {
        font-size: 14px;
        font-weight: bold;
        margin-top: 1mm;
      }
      .unregistered {
        font-size: 8px;
        color: #999;
        font-style: italic;
        margin-top: 1mm;
      }
    `;

    const regularStyles = `
      @page { margin: 10px; }
      body {
        font-family: Arial, sans-serif;
        padding: 10px;
      }
      .header {
        text-align: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #333;
      }
      .header h1 {
        font-size: 18px;
        margin-bottom: 5px;
      }
      .header p {
        font-size: 12px;
        color: #666;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(${columns}, 1fr);
        gap: 10px;
        justify-items: center;
      }
      .qr-item {
        text-align: center;
        padding: ${padding}px;
        border: 1px dashed #ccc;
        border-radius: 4px;
        break-inside: avoid;
      }
      .qr-item canvas {
        display: block;
        margin: 0 auto;
      }
      .qr-text {
        font-family: monospace;
        font-size: ${fontSize};
        font-weight: bold;
        margin-top: 5px;
        letter-spacing: 1px;
      }
      .product-name {
        font-size: 11px;
        font-weight: bold;
        margin-top: 4px;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .product-price {
        font-size: 14px;
        font-weight: bold;
        color: #2e7d32;
      }
      .unregistered {
        font-size: 10px;
        color: #999;
        font-style: italic;
        margin-top: 4px;
      }
      @media print {
        .header {
          margin-bottom: 10px;
          padding-bottom: 5px;
        }
        .qr-item {
          border: 1px solid #ddd;
        }
      }
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Códigos QR - UPS ${selectedUps}</title>
          <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            ${isThermal ? thermalStyles : regularStyles}
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Códigos QR - UPS ${selectedUps}</h1>
            <p>${headerText}</p>
          </div>
          <div class="grid" id="qr-grid">
            ${printCodes.map((entry, idx) => {
              const product = entry.product;
              const productInfoHtml = product
                ? `<div class="product-name" title="${product.name.replace(/"/g, '&quot;')}">${product.name.length > 30 ? product.name.slice(0, 30) + '…' : product.name}</div>
                   <div class="product-price">${formatCurrency(product.unitPrice)}</div>`
                : `<div class="unregistered">Sin registrar</div>`;
              return `
              <div class="qr-item">
                <div id="qr-${idx}"></div>
                ${productInfoHtml}
                <div class="qr-text">${entry.barcode}</div>
              </div>`;
            }).join('')}
          </div>
          <script>
            // Generate QR codes
            const codes = ${JSON.stringify(allBarcodes)};
            const qrSize = ${isThermal ? 60 : qrSize};

            codes.forEach((code, idx) => {
              const container = document.getElementById('qr-' + idx);
              if (container) {
                const qr = qrcode(0, '${isThermal ? 'M' : 'H'}');
                qr.addData(code);
                qr.make();
                container.innerHTML = qr.createSvgTag(Math.floor(qrSize / (qr.getModuleCount() + 8)));
              }
            });

            // Auto print after QR codes are generated
            setTimeout(() => {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            }, 500);
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <VStack spacing={{ base: 4, md: 6 }} align="stretch">
      {/* Header */}
      <Heading size={{ base: 'lg', md: 'xl' }}>
        <HStack>
          <Icon as={FiGrid} />
          <Text>Generador de Códigos QR</Text>
        </HStack>
      </Heading>

      {/* Mode Toggle */}
      <ButtonGroup size="lg" isAttached variant="outline" w="full">
        <Button
          flex={1}
          onClick={() => handleModeChange('generate')}
          colorScheme={mode === 'generate' ? 'brand' : 'gray'}
          variant={mode === 'generate' ? 'solid' : 'outline'}
        >
          Generar Nuevos
        </Button>
        <Button
          flex={1}
          onClick={() => handleModeChange('reprint')}
          colorScheme={mode === 'reprint' ? 'purple' : 'gray'}
          variant={mode === 'reprint' ? 'solid' : 'outline'}
          leftIcon={<Icon as={FiRefreshCw} />}
        >
          Reimprimir Existentes
        </Button>
      </ButtonGroup>

      {/* Settings */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <VStack spacing={4} align="stretch">
          <SimpleGrid columns={{ base: 1, md: mode === 'generate' ? 3 : 2 }} spacing={4}>
            {/* UPS Selection */}
            <FormControl isRequired>
              <FormLabel fontWeight="bold">UPS</FormLabel>
              <AutocompleteSelect
                options={UPS_BATCH_OPTIONS}
                value={selectedUps || ''}
                onChange={(val) => handleUpsChange(val)}
                placeholder="Seleccionar UPS"
                size="lg"
              />
            </FormControl>

            {/* Quantity - generate mode only */}
            {mode === 'generate' && (
              <FormControl>
                <FormLabel fontWeight="bold">Cantidad</FormLabel>
                <NumberInput
                  value={quantity}
                  onChange={(_, val) => setQuantity(val || 1)}
                  min={1}
                  max={200}
                  size="lg"
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
            )}

            {/* Starting Sequence - generate mode only */}
            {mode === 'generate' && (
              <FormControl>
                <FormLabel fontWeight="bold">Inicio desde</FormLabel>
                <NumberInput
                  value={startSequence}
                  onChange={(_, val) => setStartSequence(val || 1)}
                  min={1}
                  max={9999}
                  size="lg"
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
            )}

            {/* Size Selection - reprint mode: put it in the grid */}
            {mode === 'reprint' && (
              <FormControl>
                <FormLabel fontWeight="bold">Tamaño de Etiqueta</FormLabel>
                <ButtonGroup size="lg" isAttached variant="outline" w="full">
                  <Button
                    flex={1}
                    onClick={() => setSize('T')}
                    colorScheme={size === 'T' ? 'orange' : 'gray'}
                    variant={size === 'T' ? 'solid' : 'outline'}
                  >
                    T
                  </Button>
                  <Button
                    flex={1}
                    onClick={() => setSize('S')}
                    colorScheme={size === 'S' ? 'brand' : 'gray'}
                    variant={size === 'S' ? 'solid' : 'outline'}
                  >
                    S
                  </Button>
                  <Button
                    flex={1}
                    onClick={() => setSize('M')}
                    colorScheme={size === 'M' ? 'brand' : 'gray'}
                    variant={size === 'M' ? 'solid' : 'outline'}
                  >
                    M
                  </Button>
                  <Button
                    flex={1}
                    onClick={() => setSize('L')}
                    colorScheme={size === 'L' ? 'brand' : 'gray'}
                    variant={size === 'L' ? 'solid' : 'outline'}
                  >
                    L
                  </Button>
                </ButtonGroup>
              </FormControl>
            )}
          </SimpleGrid>

          {/* Size Selection - generate mode: full width below grid */}
          {mode === 'generate' && (
            <FormControl>
              <FormLabel fontWeight="bold">Tamaño de Etiqueta</FormLabel>
              <ButtonGroup size="lg" isAttached variant="outline" w="full">
                <Button
                  flex={1}
                  onClick={() => setSize('T')}
                  colorScheme={size === 'T' ? 'orange' : 'gray'}
                  variant={size === 'T' ? 'solid' : 'outline'}
                >
                  T - Térmica
                </Button>
                <Button
                  flex={1}
                  onClick={() => setSize('S')}
                  colorScheme={size === 'S' ? 'brand' : 'gray'}
                  variant={size === 'S' ? 'solid' : 'outline'}
                >
                  S - Pequeño
                </Button>
                <Button
                  flex={1}
                  onClick={() => setSize('M')}
                  colorScheme={size === 'M' ? 'brand' : 'gray'}
                  variant={size === 'M' ? 'solid' : 'outline'}
                >
                  M - Mediano
                </Button>
                <Button
                  flex={1}
                  onClick={() => setSize('L')}
                  colorScheme={size === 'L' ? 'brand' : 'gray'}
                  variant={size === 'L' ? 'solid' : 'outline'}
                >
                  L - Grande
                </Button>
              </ButtonGroup>
            </FormControl>
          )}

          {/* Reprint Product List */}
          {mode === 'reprint' && selectedUps && (
            <Box>
              {reprintProducts.length === 0 ? (
                <Flex
                  direction="column"
                  align="center"
                  justify="center"
                  py={8}
                  bg="gray.50"
                  borderRadius="lg"
                  border="1px dashed"
                  borderColor="gray.300"
                >
                  <Text color="gray.500" fontSize="lg">
                    No hay productos registrados en este UPS
                  </Text>
                  {excludedCount > 0 && (
                    <Text color="orange.500" fontSize="sm" mt={1}>
                      {excludedCount} producto(s) sin código de barras excluidos
                    </Text>
                  )}
                </Flex>
              ) : (
                <VStack spacing={3} align="stretch">
                  {/* Select/Deselect All + Summary */}
                  <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                    <HStack spacing={2}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={selectAll}
                      >
                        Seleccionar Todos
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={deselectAll}
                        isDisabled={reprintSelections.size === 0}
                      >
                        Deseleccionar Todos
                      </Button>
                    </HStack>
                    <HStack spacing={3}>
                      {excludedCount > 0 && (
                        <Text color="orange.500" fontSize="xs">
                          {excludedCount} sin código excluidos
                        </Text>
                      )}
                      <Badge colorScheme="purple" fontSize="sm" px={2} py={1}>
                        {reprintSelections.size} productos, {totalReprintLabels} etiquetas
                      </Badge>
                    </HStack>
                  </Flex>

                  {/* Product List */}
                  <Box
                    maxH="350px"
                    overflowY="auto"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="lg"
                  >
                    {reprintProducts.map((product) => {
                      const isSelected = reprintSelections.has(product.id);
                      const copies = reprintSelections.get(product.id) ?? 1;
                      return (
                        <Flex
                          key={product.id}
                          align="center"
                          px={3}
                          py={2}
                          borderBottom="1px solid"
                          borderColor="gray.100"
                          bg={isSelected ? 'purple.50' : 'white'}
                          _hover={{ bg: isSelected ? 'purple.100' : 'gray.50' }}
                          gap={3}
                        >
                          <Checkbox
                            isChecked={isSelected}
                            onChange={() => toggleProduct(product.id)}
                            colorScheme="purple"
                          />
                          <Box flex={1} minW={0} cursor="pointer" onClick={() => toggleProduct(product.id)}>
                            <Text fontWeight="medium" fontSize="sm" noOfLines={1}>
                              {product.name}
                            </Text>
                            <HStack spacing={2} fontSize="xs" color="gray.500">
                              <Text fontWeight="bold" color="green.600">
                                {formatCurrency(product.unitPrice)}
                              </Text>
                              <Text fontFamily="mono">{product.barcode}</Text>
                            </HStack>
                          </Box>
                          {isSelected && (
                            <HStack spacing={1}>
                              <IconButton
                                aria-label="Menos copias"
                                icon={<Icon as={FiMinus} />}
                                size="xs"
                                variant="outline"
                                onClick={() => setCopies(product.id, copies - 1)}
                                isDisabled={copies <= 1}
                              />
                              <Text fontWeight="bold" fontSize="sm" minW="24px" textAlign="center">
                                {copies}
                              </Text>
                              <IconButton
                                aria-label="Más copias"
                                icon={<Icon as={FiPlus} />}
                                size="xs"
                                variant="outline"
                                onClick={() => setCopies(product.id, copies + 1)}
                                isDisabled={copies >= 20}
                              />
                            </HStack>
                          )}
                        </Flex>
                      );
                    })}
                  </Box>
                </VStack>
              )}
            </Box>
          )}

          {/* Generate/Preview Button */}
          <Button
            leftIcon={<Icon as={FiEye} />}
            colorScheme={mode === 'reprint' ? 'purple' : 'brand'}
            size="lg"
            onClick={handleGeneratePreview}
            isDisabled={!selectedUps || (mode === 'reprint' && reprintSelections.size === 0)}
          >
            {mode === 'reprint'
              ? `Vista Previa (${totalReprintLabels} etiquetas)`
              : 'Generar Vista Previa'}
          </Button>

          {/* Summary - generate mode */}
          {mode === 'generate' && selectedUps && (
            <Flex justify="space-between" align="center" p={3} bg="blue.50" borderRadius="lg">
              <Text fontWeight="medium" color="blue.700">
                Se generarán {quantity} códigos:
              </Text>
              <HStack spacing={2}>
                <Badge colorScheme="blue" fontSize="md" px={2} py={1}>
                  {selectedUps >= NUMBERED_UPS_THRESHOLD
                    ? generateBarcode('numbered', String(selectedUps), startSequence)
                    : generateBarcode('legacy', String(selectedUps), undefined, startSequence)}
                </Badge>
                <Text color="blue.700">→</Text>
                <Badge colorScheme="blue" fontSize="md" px={2} py={1}>
                  {selectedUps >= NUMBERED_UPS_THRESHOLD
                    ? generateBarcode('numbered', String(selectedUps), startSequence + quantity - 1)
                    : generateBarcode('legacy', String(selectedUps), undefined, startSequence + quantity - 1)}
                </Badge>
              </HStack>
            </Flex>
          )}
        </VStack>
      </Box>

      {/* Preview Grid */}
      {showPreview && printCodes.length > 0 && (
        <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontWeight="bold" fontSize="lg">
              Vista Previa ({printCodes.length} {mode === 'reprint' ? 'etiquetas' : 'códigos'})
            </Text>
            <Button
              leftIcon={<Icon as={FiPrinter} />}
              colorScheme="green"
              size="lg"
              onClick={handlePrint}
            >
              Imprimir {mode === 'reprint' ? 'Etiquetas' : 'Todos'}
            </Button>
          </Flex>

          <Box
            maxH="500px"
            overflowY="auto"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            p={4}
          >
            <SimpleGrid
              columns={{
                base: size === 'T' ? 2 : size === 'S' ? 3 : 2,
                md: size === 'T' ? 2 : size === 'S' ? 5 : size === 'M' ? 4 : 3,
              }}
              spacing={3}
            >
              {printCodes.map((entry, idx) => {
                const product = entry.product;
                return (
                  <Box
                    key={`${entry.barcode}-${idx}`}
                    p={SIZE_CONFIG[size].padding / 4}
                    border="1px dashed"
                    borderColor={product ? 'green.300' : 'gray.300'}
                    borderRadius="md"
                    textAlign="center"
                    bg="white"
                  >
                    <QRCodeSVG
                      value={entry.barcode}
                      size={SIZE_CONFIG[size].qrSize}
                      level="H"
                      includeMargin={false}
                    />
                    {product ? (
                      <>
                        <Text
                          fontSize="xs"
                          fontWeight="bold"
                          mt={1}
                          noOfLines={1}
                          title={product.name}
                        >
                          {product.name}
                        </Text>
                        <Text fontSize="sm" fontWeight="bold" color="green.600">
                          {formatCurrency(product.unitPrice)}
                        </Text>
                      </>
                    ) : (
                      <Text fontSize="xs" color="gray.400" fontStyle="italic" mt={1}>
                        Sin registrar
                      </Text>
                    )}
                    <Text
                      fontFamily="mono"
                      fontSize={SIZE_CONFIG[size].fontSize}
                      fontWeight="bold"
                      mt={1}
                    >
                      {entry.barcode}
                    </Text>
                  </Box>
                );
              })}
            </SimpleGrid>
          </Box>
        </Box>
      )}
    </VStack>
  );
}
