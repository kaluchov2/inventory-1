// Common product colors in Spanish
export const PRODUCT_COLORS = [
  "Negro",
  "Blanco",
  "Azul",
  "Rojo",
  "Verde",
  "Amarillo",
  "Rosa",
  "Morado",
  "Naranja",
  "Gris",
  "Café",
  "Beige",
  "Dorado",
  "Plateado",
  "Multicolor",
  "Transparente",
  "Marino",
  "Turquesa",
  "Vino",
  "Coral",
  "Crema",
  "Nude",
  "Azul Marino",
  "Verde Olivo",
  "Terracota",
  "Mostaza",
] as const;

// Color options for select
export const COLOR_OPTIONS = PRODUCT_COLORS.map((color) => ({
  value: color,
  label: color,
}));

// Common brands (will be extended from data)
export const DEFAULT_BRANDS = [
  "Nike",
  "Adidas",
  "Puma",
  "Apple",
  "Samsung",
  "LG",
  "Sony",
  "Lenovo",
  "HP",
  "Dell",
  "Zara",
  "H&M",
  "Forever 21",
  "Levi's",
  "Calvin Klein",
  "Tommy Hilfiger",
  "Guess",
  "Coach",
  "Michael Kors",
  "Victoria's Secret",
] as const;
