import { UserRole } from '../types';

// Single source of truth for the "viewer" role restriction, shared by
// ProtectedRoute (routing) and the Sidebar/MobileNav (navigation), so the
// three don't drift out of sync when this restriction ever changes.
export const VENTAS_SAT_PATH = '/ventas-sat';

export function isViewerRole(role?: UserRole): boolean {
  return role === 'viewer';
}
