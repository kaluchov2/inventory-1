import { describe, expect, it } from 'vitest';
import {
  canModifyOperationalData,
  CUSTOMERS_PATH,
  getPostLoginPath,
  hasUnverifiedAuthenticatedProfile,
  HOME_PATH,
  isViewerRole,
  isViewerPathAllowed,
  PRODUCTS_PATH,
  VENTAS_SAT_PATH,
} from './viewerAccess';

describe('viewerAccess', () => {
  it('identifies only viewer as the restricted role', () => {
    expect(isViewerRole('viewer')).toBe(true);
    expect(isViewerRole('admin')).toBe(false);
    expect(isViewerRole('user')).toBe(false);
    expect(isViewerRole(undefined)).toBe(false);
  });

  it('routes every role to Home after login', () => {
    expect(getPostLoginPath('viewer')).toBe(HOME_PATH);
    expect(getPostLoginPath('admin')).toBe(HOME_PATH);
    expect(getPostLoginPath('user')).toBe(HOME_PATH);
    expect(getPostLoginPath(undefined)).toBe(HOME_PATH);
  });

  it('allows viewers to open only the read-only pages assigned to them', () => {
    expect(isViewerPathAllowed(HOME_PATH)).toBe(true);
    expect(isViewerPathAllowed(PRODUCTS_PATH)).toBe(true);
    expect(isViewerPathAllowed(`${PRODUCTS_PATH}/`)).toBe(true);
    expect(isViewerPathAllowed(CUSTOMERS_PATH)).toBe(true);
    expect(isViewerPathAllowed(VENTAS_SAT_PATH)).toBe(true);
    expect(isViewerPathAllowed('/ventas')).toBe(false);
    expect(isViewerPathAllowed('/configuracion')).toBe(false);
  });

  it('marks viewers as read-only without changing admin or user permissions', () => {
    expect(canModifyOperationalData('viewer')).toBe(false);
    expect(canModifyOperationalData('admin')).toBe(true);
    expect(canModifyOperationalData('user')).toBe(true);
    expect(canModifyOperationalData(undefined)).toBe(true);
  });

  it('blocks every authenticated account until its profile role is verified', () => {
    expect(hasUnverifiedAuthenticatedProfile(true, false)).toBe(true);
    expect(hasUnverifiedAuthenticatedProfile(true, true)).toBe(false);
    expect(hasUnverifiedAuthenticatedProfile(false, false)).toBe(false);
  });
});
