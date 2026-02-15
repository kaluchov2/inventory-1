import { useState, useMemo } from 'react';
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
} from '@chakra-ui/react';
import { QRCodeSVG } from 'qrcode.react';
import { FiPrinter, FiEye, FiGrid } from 'react-icons/fi';
import { generateBarcode } from '../utils/barcodeGenerator';
import { UPS_BATCH_OPTIONS } from '../constants/colors';

const NUMBERED_UPS_THRESHOLD = 20;
import { AutocompleteSelect } from '../components/common';
import { useProductStore } from '../store/productStore';
import { formatCurrency } from '../utils/formatters';
import type { Product } from '../types';

type QRSize = 'T' | 'S' | 'M' | 'L';

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

  const { getProductByBarcode, products } = useProductStore();

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
  // For UPS >= 20, also check legacy format (D30-0001) as fallback
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    const isNumbered = selectedUps && selectedUps >= NUMBERED_UPS_THRESHOLD;
    for (let idx = 0; idx < generatedCodes.length; idx++) {
      const code = generatedCodes[idx];
      let product = getProductByBarcode(code);
      if (!product && isNumbered) {
        const seq = startSequence + idx;
        const legacyCode = generateBarcode('legacy', String(selectedUps), undefined, seq);
        product = getProductByBarcode(legacyCode);
      }
      if (product) map.set(code, product);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedCodes, products, selectedUps, startSequence]);

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
    setShowPreview(true);
  };

  const handlePrint = () => {
    if (generatedCodes.length === 0) return;

    const { qrSize, fontSize, padding } = SIZE_CONFIG[size];

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
            <p>Del ${generatedCodes[0]} al ${generatedCodes[generatedCodes.length - 1]} (${generatedCodes.length} códigos)</p>
          </div>
          <div class="grid" id="qr-grid">
            ${generatedCodes.map((code, idx) => {
              const product = productMap.get(code);
              const productInfoHtml = product
                ? `<div class="product-name" title="${product.name.replace(/"/g, '&quot;')}">${product.name.length > 30 ? product.name.slice(0, 30) + '…' : product.name}</div>
                   <div class="product-price">${formatCurrency(product.unitPrice)}</div>`
                : `<div class="unregistered">Sin registrar</div>`;
              return `
              <div class="qr-item">
                <div id="qr-${idx}"></div>
                ${productInfoHtml}
                <div class="qr-text">${code}</div>
              </div>`;
            }).join('')}
          </div>
          <script>
            // Generate QR codes
            const codes = ${JSON.stringify(generatedCodes)};
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

      {/* Settings */}
      <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
        <VStack spacing={4} align="stretch">
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {/* UPS Selection */}
            <FormControl isRequired>
              <FormLabel fontWeight="bold">UPS</FormLabel>
              <AutocompleteSelect
                options={UPS_BATCH_OPTIONS}
                value={selectedUps || ''}
                onChange={(val) => setSelectedUps(val ? Number(val) : '')}
                placeholder="Seleccionar UPS"
                size="lg"
              />
            </FormControl>

            {/* Quantity */}
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

            {/* Starting Sequence */}
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
          </SimpleGrid>

          {/* Size Selection */}
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

          {/* Generate Button */}
          <Button
            leftIcon={<Icon as={FiEye} />}
            colorScheme="brand"
            size="lg"
            onClick={handleGeneratePreview}
            isDisabled={!selectedUps}
          >
            Generar Vista Previa
          </Button>

          {/* Summary */}
          {selectedUps && (
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
      {showPreview && generatedCodes.length > 0 && (
        <Box bg="white" p={{ base: 4, md: 6 }} borderRadius="xl" boxShadow="sm">
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontWeight="bold" fontSize="lg">
              Vista Previa ({generatedCodes.length} códigos)
            </Text>
            <Button
              leftIcon={<Icon as={FiPrinter} />}
              colorScheme="green"
              size="lg"
              onClick={handlePrint}
            >
              Imprimir Todos
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
              {generatedCodes.map((code) => {
                const product = productMap.get(code);
                return (
                  <Box
                    key={code}
                    p={SIZE_CONFIG[size].padding / 4}
                    border="1px dashed"
                    borderColor={product ? 'green.300' : 'gray.300'}
                    borderRadius="md"
                    textAlign="center"
                    bg="white"
                  >
                    <QRCodeSVG
                      value={code}
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
                      {code}
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
