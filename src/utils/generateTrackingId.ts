import { randomUUID } from 'crypto';

export const generateAgencyTrackingId = (): string => {
  return randomUUID().replace(/-/g, '').slice(0, 21);
}
