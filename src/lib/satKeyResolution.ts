import { SatKey } from '../types';

export interface SatKeyResolution {
  localId: string;
  canonical: SatKey;
}

const listeners = new Set<(resolution: SatKeyResolution) => void>();

export function publishSatKeyResolution(resolution: SatKeyResolution) {
  listeners.forEach((listener) => listener(resolution));
}

export function subscribeSatKeyResolution(
  listener: (resolution: SatKeyResolution) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
