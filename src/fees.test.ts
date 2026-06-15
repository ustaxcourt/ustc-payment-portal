import { FEES, FEE_KEYS, getActiveFeeByKey, getFeeById } from './fees';
import type { FeeKey } from './fees';

const mockTcsAppIds: Record<FeeKey, string> = {
  PETITION_FILING_FEE: 'TCS_PETITION',
  NONATTORNEY_EXAM_REGISTRATION_FEE: 'TCS_EXAM',
};

describe('FEES registry', () => {
  it('contains all fee keys declared in FEE_KEYS', () => {
    const registryFeeKeys = new Set(Object.values(FEES).map((f) => f.feeKey));
    for (const key of FEE_KEYS) {
      expect(registryFeeKeys).toContain(key);
    }
  });

  it('has no entry with a null feeId', () => {
    for (const [id, entry] of Object.entries(FEES)) {
      expect(id).toBeTruthy();
      expect(entry.feeId).toBe(id);
    }
  });
});

describe('getFeeById', () => {
  it('returns the fee merged with tcsAppId for a known feeId', () => {
    const result = getFeeById('PETITION_FILING_FEE', mockTcsAppIds);
    expect(result).toMatchObject({
      feeId: 'PETITION_FILING_FEE',
      feeKey: 'PETITION_FILING_FEE',
      amount: 60,
      tcsAppId: 'TCS_PETITION',
    });
  });

  it('returns undefined for an unknown feeId', () => {
    expect(getFeeById('UNKNOWN_FEE', mockTcsAppIds)).toBeUndefined();
  });

  it('does not mutate the FEES registry entry', () => {
    const before = { ...FEES['PETITION_FILING_FEE'] };
    getFeeById('PETITION_FILING_FEE', mockTcsAppIds);
    expect(FEES['PETITION_FILING_FEE']).toEqual(before);
  });
});

describe('getActiveFeeByKey', () => {
  it('returns the most recently activated fee for a key', () => {
    const result = getActiveFeeByKey('PETITION_FILING_FEE', mockTcsAppIds);
    expect(result).toMatchObject({
      feeKey: 'PETITION_FILING_FEE',
      tcsAppId: 'TCS_PETITION',
    });
  });

  it('merges tcsAppId into the returned fee', () => {
    const result = getActiveFeeByKey('NONATTORNEY_EXAM_REGISTRATION_FEE', mockTcsAppIds);
    expect(result?.tcsAppId).toBe('TCS_EXAM');
  });

  it('returns undefined for an unknown feeKey', () => {
    expect(
      getActiveFeeByKey('UNKNOWN_KEY' as FeeKey, mockTcsAppIds),
    ).toBeUndefined();
  });

  it('excludes fees with a future activationDate', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const originalFees = { ...FEES };

    // Temporarily inject a future-dated entry
    FEES['FUTURE_FEE'] = {
      feeId: 'FUTURE_FEE',
      feeKey: 'PETITION_FILING_FEE',
      name: 'Future Fee',
      isVariable: false,
      amount: 999,
      description: 'Future fee',
      activationDate: futureDate,
    };

    const result = getActiveFeeByKey('PETITION_FILING_FEE', mockTcsAppIds);
    expect(result?.feeId).not.toBe('FUTURE_FEE');

    // Restore
    delete FEES['FUTURE_FEE'];
    Object.assign(FEES, originalFees);
  });

  it('returns the latest active version when multiple versions exist for a key', () => {
    const olderDate = '2020-01-01T00:00:00Z';

    FEES['PETITION_FILING_FEE_OLD'] = {
      feeId: 'PETITION_FILING_FEE_OLD',
      feeKey: 'PETITION_FILING_FEE',
      name: 'Old Petition Fee',
      isVariable: false,
      amount: 45,
      description: 'Older version',
      activationDate: olderDate,
    };

    const result = getActiveFeeByKey('PETITION_FILING_FEE', mockTcsAppIds);
    expect(result?.feeId).toBe('PETITION_FILING_FEE');

    delete FEES['PETITION_FILING_FEE_OLD'];
  });
});
