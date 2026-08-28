import { UserRole } from '../types';

// Single source of truth for the read-only "viewer" role, shared by routing,
// navigation and pages so access and write controls do not drift apart.
export const HOME_PATH = '/';
export const PRODUCTS_PATH = '/productos';
export const CUSTOMERS_PATH = '/clientes';
export const VENTAS_SAT_PATH = '/ventas-sat';
export const SETTINGS_PATH = '/configuracion';

export const VIEWER_ALLOWED_PATHS = [
  HOME_PATH,
  PRODUCTS_PATH,
  CUSTOMERS_PATH,
  VENTAS_SAT_PATH,
  SETTINGS_PATH,
] as const;

// Roles live in public.profiles, not in the Supabase auth session. Until that
// profile is verified, no authenticated account may enter protected routes.
export function hasUnverifiedAuthenticatedProfile(
  isAuthenticated: boolean,
  isProfileHydrated: boolean,
): boolean {
  return isAuthenticated && !isProfileHydrated;
}

export function isViewerRole(role?: UserRole): boolean {
  return role === 'viewer';
}

export function canModifyOperationalData(role?: UserRole): boolean {
  return !isViewerRole(role);
}

export function isViewerPathAllowed(pathname: string): boolean {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (VIEWER_ALLOWED_PATHS as readonly string[]).includes(normalizedPath);
}

export function getPostLoginPath(_role?: UserRole): string {
  return HOME_PATH;
}
