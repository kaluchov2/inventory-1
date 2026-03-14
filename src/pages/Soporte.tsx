import {
  VStack,
  Heading,
  Box,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Text,
  Icon,
  HStack,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import {
  FiHelpCircle,
  FiPackage,
  FiShoppingCart,
  FiBarChart2,
  FiDatabase,
  FiRefreshCw,
} from 'react-icons/fi';

type FaqItem = {
  question: string;
  answer: string;
};

type FaqSection = {
  title: string;
  icon: any;
  items: FaqItem[];
};

const faqSections: FaqSection[] = [
  {
    title: 'Preguntas de Productos',
    icon: FiPackage,
    items: [
      {
        question: 'Como valido que un producto quedo guardado y sincronizado?',
        answer:
          'Despues de guardar, verifica que aparezca en Productos con datos correctos. Luego confirma que el estado de sincronizacion no tenga pendientes. Si hay internet, tambien debe verse al recargar la app.',
      },
      {
        question: 'Como valido que Imprimir QR funciona?',
        answer:
          'Abre el producto y usa Imprimir QR. Verifica que el codigo muestre UPS y secuencia correctos antes de imprimir. Si no coincide, vuelve al producto, corrige datos y genera de nuevo.',
      },
      {
        question: 'Que hago si la base de datos esta desconectada?',
        answer:
          'La app trabaja en modo local y guarda en cola. Como workaround, cierra y abre la app, valida internet y espera a que cambie el estado de sincronizacion. Al reconectar, la cola se envia automaticamente.',
      },
    ],
  },
  {
    title: 'Preguntas de Ventas',
    icon: FiShoppingCart,
    items: [
      {
        question: 'Como valido que una venta fue exitosa?',
        answer:
          'Ve a Transacciones, elige cliente y fecha, y presiona Buscar. Si fue sin cliente, selecciona Cliente de Paso (sin registrar). Debes ver total y metodo de pago correctos.',
      },
      {
        question: 'Que pasa si no seleccione cliente en la venta?',
        answer:
          'Se guarda como Cliente de Paso. Para validarla o exportarla, usa la opcion Cliente de Paso en Transacciones o en Configuracion > Exportar ventas por cliente.',
      },
      {
        question: 'Que hago si un item no sincroniza y ya presione Reintentar?',
        answer:
          'Revisa cola pendiente y dead letter en Configuracion. Si sigue fallando, intenta cerrar/abrir la app y forzar sincronizacion. Si persiste, reporta el caso con hora, cliente y monto para revisarlo rapido.',
      },
    ],
  },
  {
    title: 'Preguntas de Excel y Reportes',
    icon: FiBarChart2,
    items: [
      {
        question: 'Como valido ventas con Transacciones y con Excel?',
        answer:
          'Primero valida por cliente+fecha en Transacciones. Luego descarga el Excel completo de transacciones en Configuracion y confirma que el registro tambien este ahi.',
      },
      {
        question: 'Como descargo transacciones de un cliente especifico?',
        answer:
          'En Configuracion > Exportar, selecciona el cliente y presiona Ventas Cliente. Para ventas sin cliente usa Cliente de Paso (sin registrar).',
      },
      {
        question: 'Como valido cuando la DB se corta durante una exportacion?',
        answer:
          'La exportacion cae a cache local cuando no responde remoto. Puedes reintentar despues de reconectar para obtener el archivo mas actualizado.',
      },
    ],
  },
  {
    title: 'Sincronizacion y Recuperacion',
    icon: FiDatabase,
    items: [
      {
        question: 'Como funciona cuando no hay internet?',
        answer:
          'Las operaciones se guardan localmente y se encolan. Al volver internet, la app intenta sincronizar sola. Si no avanza, usa Reintentar y luego Forzar sincronizacion.',
      },
      {
        question: 'Workaround rapido cuando algo parece atorado',
        answer:
          '1) Espera unos segundos. 2) Cierra y abre la app. 3) Revisa estado de sincronizacion. 4) Usa Reintentar. 5) Si no se resuelve, comparte evidencia en Soporte para escalar.',
      },
    ],
  },
];

export function Soporte() {
  return (
    <VStack spacing={{ base: 4, md: 6, lg: 8 }} align="stretch">
      <Heading size={{ base: 'lg', md: 'xl' }} color="gray.800">
        Soporte
      </Heading>

      <Box bg="white" borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="sm">
        <HStack spacing={2} mb={4}>
          <Icon as={FiHelpCircle} boxSize={5} color="brand.500" />
          <Heading size="md" color="gray.700">
            Preguntas Frecuentes
          </Heading>
        </HStack>
        <Divider mb={4} />

        <VStack spacing={5} align="stretch">
          {faqSections.map((section) => (
            <Box key={section.title}>
              <HStack spacing={2} mb={2}>
                <Icon as={section.icon} color="brand.500" />
                <Heading size="sm" color="gray.700">
                  {section.title}
                </Heading>
              </HStack>

              <Accordion allowMultiple>
                {section.items.map((faq, i) => (
                  <AccordionItem key={`${section.title}-${i}`} border="none" mb={2}>
                    <AccordionButton
                      bg="gray.50"
                      borderRadius="lg"
                      _expanded={{ bg: 'brand.50', color: 'brand.700' }}
                      _hover={{ bg: 'gray.100' }}
                      px={4}
                      py={3}
                    >
                      <Box flex="1" textAlign="left" fontWeight="medium" fontSize="sm">
                        {faq.question}
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pb={4} pt={3} px={4}>
                      <Text color="gray.600" fontSize="sm">
                        {faq.answer}
                      </Text>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            </Box>
          ))}
        </VStack>
      </Box>

      <Box bg="white" borderRadius="xl" p={{ base: 4, md: 6 }} boxShadow="sm">
        <HStack spacing={2} mb={3}>
          <Icon as={FiRefreshCw} color="orange.500" />
          <Heading size="sm" color="gray.700">
            Disclaimer
          </Heading>
        </HStack>
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <Text fontSize="sm">
            Estamos en fase de pruebas. Mientras mas pronto reporten errores, mas pronto podremos resolverlos.
          </Text>
        </Alert>
      </Box>
    </VStack>
  );
}
