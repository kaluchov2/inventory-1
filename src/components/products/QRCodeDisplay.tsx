import { useRef } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Box,
  Icon,
  Badge,
  Divider,
} from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { FiPrinter, FiDownload } from "react-icons/fi";
import { Product } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import { getCategoryLabel } from "../../constants/categories";

interface QRCodeDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export function QRCodeDisplay({
  isOpen,
  onClose,
  product,
}: QRCodeDisplayProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!product) return null;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${product.name}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .qr-container {
              text-align: center;
              padding: 30px;
              border: 2px solid #333;
              border-radius: 10px;
              max-width: 350px;
            }
            .qr-code {
              margin: 20px auto;
            }
            .product-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 10px;
              word-wrap: break-word;
            }
            .product-price {
              font-size: 24px;
              font-weight: bold;
              color: #2e7d32;
              margin-bottom: 10px;
            }
            .product-details {
              font-size: 12px;
              color: #666;
              margin-bottom: 10px;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 24px;
              font-weight: bold;
              letter-spacing: 2px;
              margin-top: 10px;
              padding: 5px 10px;
              background: #f5f5f5;
              border-radius: 5px;
            }
            @media print {
              body {
                padding: 0;
              }
              .qr-container {
                border: 1px solid #000;
              }
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <div class="product-name">${product.name}</div>
            <div class="product-price">${formatCurrency(product.unitPrice)}</div>
            <div class="product-details">
              UPS ${product.upsBatch} | ${getCategoryLabel(product.category)}
              ${product.brand ? ` | ${product.brand}` : ""}
            </div>
            <div class="qr-code">
              ${printContent.querySelector("svg")?.outerHTML || ""}
            </div>
            <div class="barcode-text">${product.barcode || "-"}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const handleDownload = () => {
    const svg = printRef.current?.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = `QR-${product.barcode || product.name}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Código QR del Producto</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="center">
            {/* Product Info */}
            <Box textAlign="center">
              <Text fontWeight="bold" fontSize="lg" noOfLines={2}>
                {product.name}
              </Text>
              <Text fontSize="2xl" fontWeight="bold" color="green.500">
                {formatCurrency(product.unitPrice)}
              </Text>
              <HStack spacing={2} justify="center" mt={2}>
                <Badge colorScheme="blue">UPS {product.upsBatch}</Badge>
                <Badge colorScheme="purple">
                  {getCategoryLabel(product.category)}
                </Badge>
              </HStack>
            </Box>

            <Divider />

            {/* QR Code */}
            <Box
              ref={printRef}
              p={6}
              bg="white"
              borderRadius="lg"
              border="2px solid"
              borderColor="gray.200"
            >
              <VStack spacing={3}>
                <QRCodeSVG
                  value={product.barcode || product.id}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
                <Text
                  fontFamily="mono"
                  fontSize="lg"
                  fontWeight="bold"
                  letterSpacing="wider"
                  bg="gray.100"
                  px={4}
                  py={2}
                  borderRadius="md"
                >
                  {product.barcode || "-"}
                </Text>
              </VStack>
            </Box>

            {/* Additional Details */}
            {(product.brand || product.color || product.size) && (
              <Text fontSize="sm" color="gray.500">
                {[product.brand, product.color, product.size]
                  .filter(Boolean)
                  .join(" • ")}
              </Text>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3} w="full" justify="center">
            <Button
              leftIcon={<Icon as={FiDownload} />}
              variant="outline"
              onClick={handleDownload}
            >
              Descargar
            </Button>
            <Button
              leftIcon={<Icon as={FiPrinter} />}
              colorScheme="brand"
              onClick={handlePrint}
              size="lg"
            >
              Imprimir
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
