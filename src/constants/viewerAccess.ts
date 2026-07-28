import { UserRole } from '../types';

// Single source of truth for the "viewer" role restriction, shared by
// ProtectedRoute (routing) and the Sidebar/MobileNav (navigation), so the
// three don't drift out of sync when this restriction ever changes.
export const VENTAS_SAT_PATH = '/ventas-sat';

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

export function getPostLoginPath(role?: UserRole): string {
  return isViewerRole(role) ? VENTAS_SAT_PATH : '/';
}
