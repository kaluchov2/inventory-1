import { Box, Text, VStack, Icon, HStack } from '@chakra-ui/react';
import { IconType } from 'react-icons';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: IconType;
  colorScheme?: 'brand' | 'success' | 'warning' | 'danger';
  subtitle?: string;
}

const colorMap = {
  brand: { bg: 'brand.50', color: 'brand.500', iconBg: 'brand.100' },
  success: { bg: 'green.50', color: 'green.500', iconBg: 'green.100' },
  warning: { bg: 'orange.50', color: 'orange.500', iconBg: 'orange.100' },
  danger: { bg: 'red.50', color: 'red.500', iconBg: 'red.100' },
};

export function StatCard({
  title,
  value,
  icon,
  colorScheme = 'brand',
  subtitle,
}: StatCardProps) {
  const colors = colorMap[colorScheme];

  return (
    <Box
      bg="white"
      borderRadius="xl"
      p={6}
      boxShadow="sm"
      border="1px"
      borderColor="gray.100"
    >
      <HStack spacing={4} align="start">
        {icon && (
          <Box
            p={3}
            borderRadius="lg"
            bg={colors.iconBg}
          >
            <Icon as={icon} boxSize={6} color={colors.color} />
          </Box>
        )}
        <VStack align="start" spacing={1} flex={1}>
          <Text fontSize="md" color="gray.500" fontWeight="medium">
            {title}
          </Text>
          <Text fontSize="3xl" fontWeight="bold" color={colors.color}>
            {value}
          </Text>
          {subtitle && (
            <Text fontSize="sm" color="gray.400">
              {subtitle}
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}
