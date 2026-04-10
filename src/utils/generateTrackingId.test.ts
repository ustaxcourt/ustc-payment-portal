import { generateAgencyTrackingId } from './generateTrackingId';

describe('generateAgencyTrackingId', () => {
  it('should generate a string of length 1-21', () => {
    const id = generateAgencyTrackingId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThanOrEqual(1);
    expect(id.length).toBeLessThanOrEqual(21);
  });

  it('should generate only alphanumeric characters', () => {
    const id = generateAgencyTrackingId();
    expect(/^[a-zA-Z0-9]+$/.test(id)).toBe(true);
  });

  it('should generate different values on each call', () => {
    const id1 = generateAgencyTrackingId();
    const id2 = generateAgencyTrackingId();
    expect(id1).not.toBe(id2);
  });
});
