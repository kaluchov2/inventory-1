import { CategoryCode } from '../types';

/**
 * V2 Categories - 34 total (27 original + 7 new)
 */

// Category labels in Spanish
export const CATEGORY_LABELS: Record<CategoryCode, string> = {
  // Original 27 categories
  HG: 'Hogar',
  DAM: 'Damas',
  CAB: 'Caballeros',
  ZPT: 'Zapatos',
  EL: 'Electrónica',
  BLLZ: 'Belleza',
  ACC: 'Accesorios',
  BLS: 'Blusas',
  DEP: 'Deportes',
  REL: 'Relojes',
  FERR: 'Ferretería',
  RI: 'Ropa Interior',
  JY: 'Joyería',
  BB: 'Bebé',
  JUG: 'Juguetes',
  SAL: 'Salud',
  N: 'Niños',
  MOCH: 'Mochilas',
  VIB: 'Varios',
  LD: 'Libros',
  LT: 'Lentes',
  MASC: 'Mascotas',
  CEL: 'Celulares',
  COMP: 'Computadoras',
  AUTO: 'Automóvil',
  BL: 'Blancos',
  DOC: 'Médico',
  // V2: 7 new categories
  COC: 'Cocina',
  JAR: 'Jardín',
  DEC: 'Decoración',
  MUE: 'Muebles',
  PAP: 'Papelería',
  MUS: 'Música',
  TOOL: 'Herramientas',
};

// All category codes for dropdowns
export const CATEGORY_CODES = Object.keys(CATEGORY_LABELS) as CategoryCode[];

// Category options for select dropdowns
export const CATEGORY_OPTIONS = CATEGORY_CODES.map(code => ({
  value: code,
  label: `${CATEGORY_LABELS[code]} (${code})`,
}));

/**
 * V2: Comprehensive category aliases for normalization
 * Maps common variations, typos, and abbreviations to canonical codes
 */
export const CATEGORY_ALIASES: Record<string, CategoryCode> = {
  // Hogar
  'HOGAR': 'HG',
  'HOG': 'HG',
  'HOME': 'HG',

  // Damas
  'DAMAS': 'DAM',
  'MUJER': 'DAM',
  'MUJERES': 'DAM',
  'FEMENINO': 'DAM',
  'FEM': 'DAM',
  'D': 'DAM',

  // Caballeros
  'CABALLEROS': 'CAB',
  'CABALLERO': 'CAB',
  'HOMBRE': 'CAB',
  'HOMBRES': 'CAB',
  'MASCULINO': 'CAB',
  'MASC ': 'CAB',  // Note: 'MASC' without space is mascotas

  // Zapatos
  'ZAPATOS': 'ZPT',
  'ZAPATO': 'ZPT',
  'CALZADO': 'ZPT',
  'SHOES': 'ZPT',
  'ZAP': 'ZPT',

  // Electrónica
  'ELECTRONICA': 'EL',
  'ELECTRÓNICA': 'EL',
  'ELECTR': 'EL',
  'ELEC': 'EL',

  // Belleza
  'BELLEZA': 'BLLZ',
  'BEAUTY': 'BLLZ',
  'BEL': 'BLLZ',
  'BZ': 'BLLZ',

  // Accesorios
  'ACCESORIOS': 'ACC',
  'ACCESORIO': 'ACC',
  'ACCS': 'ACC',

  // Blusas
  'BLUSAS': 'BLS',
  'BLUSA': 'BLS',

  // Deportes
  'DEPORTES': 'DEP',
  'DEPORTE': 'DEP',
  'SPORT': 'DEP',
  'SPORTS': 'DEP',
  'DP': 'DEP',
  'DEPOR': 'DEP',

  // Relojes
  'RELOJES': 'REL',
  'RELOJ': 'REL',
  'WATCH': 'REL',
  'WATCHES': 'REL',

  // Ferretería
  'FERRETERIA': 'FERR',
  'FERRETERÍA': 'FERR',
  'FER': 'FERR',
  'HARDWARE': 'FERR',

  // Ropa Interior
  'ROPA INTERIOR': 'RI',
  'INTERIOR': 'RI',
  'UNDERWEAR': 'RI',

  // Joyería
  'JOYERIA': 'JY',
  'JOYERÍA': 'JY',
  'JOY': 'JY',
  'JEWELRY': 'JY',
  'JY ': 'JY',

  // Bebé
  'BEBE': 'BB',
  'BEBÉ': 'BB',
  'BABY': 'BB',
  'BEBES': 'BB',

  // Juguetes
  'JUGUETES': 'JUG',
  'JUGUETE': 'JUG',
  'TOYS': 'JUG',
  'TOY': 'JUG',
  'JGT': 'JUG',
  'JUGS': 'JUG',

  // Salud
  'SALUD': 'SAL',
  'HEALTH': 'SAL',

  // Niños
  'NIÑOS': 'N',
  'NINOS': 'N',
  'KIDS': 'N',
  'CHILDREN': 'N',
  'INFANTIL': 'N',

  // Mochilas
  'MOCHILAS': 'MOCH',
  'MOCHILA': 'MOCH',
  'MCH': 'MOCH',
  'BACKPACK': 'MOCH',

  // Varios
  'VARIOS': 'VIB',
  'VARIO': 'VIB',
  'V ': 'VIB',
  'V': 'VIB',
  'MISC': 'VIB',
  'OTHER': 'VIB',
  'OTROS': 'VIB',

  // Libros
  'LIBROS': 'LD',
  'LIBRO': 'LD',
  'BOOKS': 'LD',
  'LIB': 'LD',

  // Lentes
  'LENTES': 'LT',
  'LENTE': 'LT',
  'GLASSES': 'LT',
  'ANTEOJOS': 'LT',

  // Mascotas
  'MASCOTAS': 'MASC',
  'MASCOTA': 'MASC',
  'PET': 'MASC',
  'PETS': 'MASC',
  'MAS': 'MASC',

  // Celulares
  'CELULARES': 'CEL',
  'CELULAR': 'CEL',
  'TELEFONO': 'CEL',
  'TELEFONOS': 'CEL',
  'PHONE': 'CEL',
  'PHONES': 'CEL',
  'CELL': 'CEL',

  // Computadoras
  'COMPUTADORAS': 'COMP',
  'COMPUTADORA': 'COMP',
  'COMPUTER': 'COMP',
  'COMPUTERS': 'COMP',
  'PC': 'COMP',
  'LAPTOP': 'COMP',

  // Automóvil
  'AUTOMOVIL': 'AUTO',
  'AUTOMÓVIL': 'AUTO',
  'AUTOS': 'AUTO',
  'CAR': 'AUTO',
  'CARS': 'AUTO',
  'CARRO': 'AUTO',
  'CARROS': 'AUTO',

  // Blancos
  'BLANCOS': 'BL',
  'BLANCO': 'BL',
  'BL ': 'BL',

  // Médico
  'MEDICO': 'DOC',
  'MÉDICO': 'DOC',
  'DOCTOR': 'DOC',
  'MEDICAL': 'DOC',

  // V2: New categories aliases
  // Cocina
  'COCINA': 'COC',
  'KITCHEN': 'COC',
  'COOK': 'COC',

  // Jardín
  'JARDIN': 'JAR',
  'JARDÍN': 'JAR',
  'GARDEN': 'JAR',

  // Decoración
  'DECORACION': 'DEC',
  'DECORACIÓN': 'DEC',
  'DECOR': 'DEC',

  // Muebles
  'MUEBLES': 'MUE',
  'MUEBLE': 'MUE',
  'FURNITURE': 'MUE',

  // Papelería
  'PAPELERIA': 'PAP',
  'PAPELERÍA': 'PAP',
  'OFFICE': 'PAP',
  'STATIONERY': 'PAP',

  // Música
  'MUSICA': 'MUS',
  'MÚSICA': 'MUS',
  'MUSIC': 'MUS',

  // Herramientas
  'HERRAMIENTAS': 'TOOL',
  'HERRAMIENTA': 'TOOL',
  'TOOLS': 'TOOL',
};

/**
 * Normalize category codes from Excel (handle typos and variations)
 * V2: Uses comprehensive CATEGORY_ALIASES mapping
 */
export const normalizeCategory = (cat: string): CategoryCode => {
  if (!cat) return 'VIB';

  const normalized = cat.trim().toUpperCase();

  // First check if it's already a valid category code
  if (CATEGORY_LABELS[normalized as CategoryCode]) {
    return normalized as CategoryCode;
  }

  // Then check aliases
  if (CATEGORY_ALIASES[normalized]) {
    return CATEGORY_ALIASES[normalized];
  }

  // Check for partial matches in aliases (for cases like "MAS " with trailing space)
  for (const [alias, code] of Object.entries(CATEGORY_ALIASES)) {
    if (normalized === alias.trim() || normalized.startsWith(alias)) {
      return code;
    }
  }

  // Default to VIB (Varios) for unknown categories
  return 'VIB';
};

/**
 * Get display label for category
 */
export const getCategoryLabel = (code: CategoryCode): string => {
  return CATEGORY_LABELS[code] || code;
};

/**
 * Check if a string is a valid category code
 */
export const isValidCategory = (code: string): code is CategoryCode => {
  return code in CATEGORY_LABELS;
};

/**
 * Get all categories grouped by type (for UI organization)
 */
export const CATEGORY_GROUPS: Record<string, CategoryCode[]> = {
  'Ropa': ['DAM', 'CAB', 'BLS', 'RI', 'N'],
  'Calzado y Accesorios': ['ZPT', 'ACC', 'MOCH', 'REL', 'JY', 'LT'],
  'Tecnología': ['EL', 'CEL', 'COMP'],
  'Hogar': ['HG', 'COC', 'JAR', 'DEC', 'MUE', 'BL'],
  'Salud y Belleza': ['BLLZ', 'SAL', 'DOC'],
  'Entretenimiento': ['JUG', 'LD', 'MUS'],
  'Otros': ['DEP', 'FERR', 'MASC', 'AUTO', 'PAP', 'TOOL', 'BB', 'VIB'],
};
