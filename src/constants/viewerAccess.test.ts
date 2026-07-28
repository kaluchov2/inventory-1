import { describe, expect, it } from 'vitest';
import {
  getPostLoginPath,
  hasUnverifiedAuthenticatedProfile,
  isViewerRole,
  VENTAS_SAT_PATH,
} from './viewerAccess';

describe('viewerAccess', () => {
  it('identifies only viewer as the restricted role', () => {
    expect(isViewerRole('viewer')).toBe(true);
    expect(isViewerRole('admin')).toBe(false);
    expect(isViewerRole('user')).toBe(false);
    expect(isViewerRole(undefined)).toBe(false);
  });

  it('routes viewers to Ventas SAT after login without changing other users', () => {
    expect(getPostLoginPath('viewer')).toBe(VENTAS_SAT_PATH);
    expect(getPostLoginPath('admin')).toBe('/');
    expect(getPostLoginPath('user')).toBe('/');
    expect(getPostLoginPath(undefined)).toBe('/');
  });

  it('blocks every authenticated account until its profile role is verified', () => {
    expect(hasUnverifiedAuthenticatedProfile(true, false)).toBe(true);
    expect(hasUnverifiedAuthenticatedProfile(true, true)).toBe(false);
    expect(hasUnverifiedAuthenticatedProfile(false, false)).toBe(false);
  });
});
