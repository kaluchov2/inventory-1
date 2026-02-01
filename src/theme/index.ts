import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

// Elder-friendly configuration
const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

// Custom colors
const colors = {
  brand: {
    50: '#E6F2FF',
    100: '#B3D9FF',
    200: '#80BFFF',
    300: '#4DA6FF',
    400: '#1A8CFF',
    500: '#2B6CB0', // Primary blue
    600: '#225694',
    700: '#1A4178',
    800: '#112B5C',
    900: '#091640',
  },
  success: {
    50: '#E6F7ED',
    100: '#B3E8CA',
    200: '#80D9A7',
    300: '#4DCA84',
    400: '#38A169', // Success green
    500: '#2E8555',
    600: '#256942',
    700: '#1C4D2F',
    800: '#12311C',
    900: '#091509',
  },
  warning: {
    50: '#FFF8E6',
    100: '#FFEAB3',
    200: '#FFDC80',
    300: '#FFCE4D',
    400: '#D69E2E', // Warning yellow
    500: '#B38626',
    600: '#906D1E',
    700: '#6D5316',
    800: '#4A390E',
    900: '#271E06',
  },
  danger: {
    50: '#FDE8E8',
    100: '#F9BABA',
    200: '#F58D8D',
    300: '#F15F5F',
    400: '#E53E3E', // Danger red
    500: '#C73232',
    600: '#A92727',
    700: '#8B1C1C',
    800: '#6D1111',
    900: '#4F0606',
  },
};

// Font sizes - larger for elderly users
const fontSizes = {
  xs: '14px',
  sm: '16px',
  md: '18px',  // Body text minimum 18px
  lg: '20px',
  xl: '22px',  // Button text
  '2xl': '26px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
  '6xl': '60px',
};

// Component overrides
const components = {
  Button: {
    baseStyle: {
      fontWeight: 'bold',
      borderRadius: 'lg',
    },
    sizes: {
      sm: {
        fontSize: 'lg',
        px: 4,
        py: 3,
        minH: '44px',
      },
      md: {
        fontSize: 'xl',
        px: 6,
        py: 4,
        minH: '52px',
      },
      lg: {
        fontSize: 'xl',
        px: 8,
        py: 6,
        minH: '60px',
      },
    },
    defaultProps: {
      size: 'md',
      colorScheme: 'brand',
    },
  },
  Input: {
    sizes: {
      md: {
        field: {
          fontSize: 'lg',
          px: 4,
          py: 4,
          minH: '52px',
          borderRadius: 'lg',
        },
      },
      lg: {
        field: {
          fontSize: 'xl',
          px: 5,
          py: 5,
          minH: '60px',
          borderRadius: 'lg',
        },
      },
    },
    defaultProps: {
      size: 'md',
    },
  },
  Select: {
    sizes: {
      md: {
        field: {
          fontSize: 'lg',
          px: 4,
          py: 4,
          minH: '52px',
          borderRadius: 'lg',
        },
      },
      lg: {
        field: {
          fontSize: 'xl',
          px: 5,
          py: 5,
          minH: '60px',
          borderRadius: 'lg',
        },
      },
    },
    defaultProps: {
      size: 'md',
    },
  },
  Textarea: {
    sizes: {
      md: {
        fontSize: 'lg',
        px: 4,
        py: 4,
        minH: '120px',
        borderRadius: 'lg',
      },
    },
    defaultProps: {
      size: 'md',
    },
  },
  FormLabel: {
    baseStyle: {
      fontSize: 'lg',
      fontWeight: 'semibold',
      mb: 2,
    },
  },
  Heading: {
    baseStyle: {
      fontWeight: 'bold',
      color: 'gray.800',
    },
    sizes: {
      lg: {
        fontSize: '2xl',
      },
      xl: {
        fontSize: '3xl',
      },
      '2xl': {
        fontSize: '4xl',
      },
    },
  },
  Text: {
    baseStyle: {
      fontSize: 'md',
      color: 'gray.700',
    },
  },
  Table: {
    sizes: {
      md: {
        th: {
          fontSize: 'md',
          px: 4,
          py: 4,
        },
        td: {
          fontSize: 'md',
          px: 4,
          py: 4,
        },
      },
    },
    defaultProps: {
      size: 'md',
    },
  },
  Card: {
    baseStyle: {
      container: {
        borderRadius: 'xl',
        boxShadow: 'md',
      },
    },
  },
  Modal: {
    baseStyle: {
      dialog: {
        borderRadius: 'xl',
      },
      header: {
        fontSize: '2xl',
        fontWeight: 'bold',
      },
      body: {
        fontSize: 'lg',
      },
    },
  },
  Alert: {
    baseStyle: {
      container: {
        borderRadius: 'lg',
        fontSize: 'lg',
      },
    },
  },
  Badge: {
    baseStyle: {
      fontSize: 'md',
      px: 3,
      py: 1,
      borderRadius: 'md',
    },
  },
  Menu: {
    baseStyle: {
      item: {
        fontSize: 'lg',
        py: 3,
        px: 4,
      },
    },
  },
};

// Global styles
const styles = {
  global: {
    body: {
      bg: 'gray.50',
      color: 'gray.800',
      fontSize: 'md',
      lineHeight: 'tall',
    },
    '*': {
      scrollbarWidth: 'thin',
      scrollbarColor: 'gray.400 gray.100',
    },
    '*::-webkit-scrollbar': {
      width: '10px',
    },
    '*::-webkit-scrollbar-track': {
      bg: 'gray.100',
    },
    '*::-webkit-scrollbar-thumb': {
      bg: 'gray.400',
      borderRadius: 'full',
    },
  },
};

// Spacing - generous for touch targets
const space = {
  px: '1px',
  0.5: '4px',
  1: '8px',
  1.5: '10px',
  2: '12px',
  2.5: '14px',
  3: '16px',
  3.5: '18px',
  4: '20px',
  5: '24px',
  6: '28px',
  7: '32px',
  8: '36px',
  9: '40px',
  10: '44px',
  12: '52px',
  14: '60px',
  16: '68px',
  20: '84px',
  24: '100px',
  28: '116px',
  32: '132px',
  36: '148px',
  40: '164px',
};

export const theme = extendTheme({
  config,
  colors,
  fontSizes,
  components,
  styles,
  space,
  fonts: {
    heading: 'system-ui, -apple-system, sans-serif',
    body: 'system-ui, -apple-system, sans-serif',
  },
});
