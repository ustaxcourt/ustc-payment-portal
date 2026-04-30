import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';
import FeesModel from '../../../src/db/FeesModel';
import { generateAgencyTrackingId } from '../../../src/utils/generateTrackingId';

type GenerateTransactionsParams = {
  successTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  multiAttemptGroups?: number;
};

type TransactionRow = {
  agency_tracking_id: string;
  paygov_tracking_id: string | null;
  fee_id: string;
  transaction_amount: number;
  client_name: string;
  transaction_reference_id: string;
  payment_status: string;
  transaction_status: string | null;
  paygov_token: string | null;
  payment_method: string | null;
  transaction_date: string | null;
  payment_date: string | null;
  return_code: number | null;
  return_detail: string | null;
  metadata: Record<string, string> | null;
  created_at: string;
  last_updated_at: string;
}

export const generateTransactions = async ({
  successTransactions,
  failedTransactions,
  pendingTransactions,
  multiAttemptGroups = 0,
}: GenerateTransactionsParams): Promise<TransactionRow[]> => {
  const feesList = await FeesModel.query().select('feeId', 'amount');
  const clientNames = ['payment-portal', 'efile-portal', 'clerk-app'];
  const paymentMethods = ["plastic_card", "ach", "paypal"] as const;

  const agencyIds = ['USTC', 'IRS'];
  const agencyCounters: Record<string, number> = Object.fromEntries(agencyIds.map((agencyId) => [agencyId, 0]));

  const getTransactionStatus = (paymentStatus: 'success' | 'failed' | 'pending'): string => {
    switch (paymentStatus) {
      case 'success':
        return 'processed';
      case 'failed':
        return 'failed';
      case 'pending':
        return faker.helpers.arrayElement(['initiated', 'received', 'pending']);
    }
  };

  const returnCodes = [3001, 3002, 5000];
  const returnDetails = [
    "The card has been declined, the transaction will not be processed.",
    "Invalid card number.",
    "An internal error occurred. Please try again.",
  ];

  type RowOverrides = {
    transactionReferenceId?: string;
    fee?: typeof feesList[number];
    clientName?: string;
    createdAt?: string;
  };

  const makeRow = (payment_status: 'success' | 'failed' | 'pending', overrides: RowOverrides = {}) => {
    const agencyId = faker.helpers.arrayElement(agencyIds);
    const fee = overrides.fee ?? faker.helpers.arrayElement(feesList);
    agencyCounters[agencyId] += 1;
    const transactionReferenceId = overrides.transactionReferenceId ?? faker.string.uuid();
    const createdAt = overrides.createdAt ?? dayjs()
      .subtract(faker.number.int({ min: 1, max: 40 }), 'day')
      .add(faker.number.int({ min: 0, max: 86400 }), 'second')
      .toISOString();
    const lastUpdatedAt = dayjs(createdAt)
      .add(faker.number.int({ min: 0, max: 5 }), 'day')
      .add(faker.number.int({ min: 0, max: 3600 }), 'second')
      .toISOString();
    const maybeMetadata = {
      accountHolder: faker.person.fullName(),
      agencyId,
      userAgent: faker.internet.userAgent(),
      isHighValue: faker.number.int({ min: 100, max: 900 }) >= 200 ? 'true' : 'false',
    };

    const hasPayGovResponse = payment_status === 'success' || payment_status === 'failed';
    const transactionDate = hasPayGovResponse
      ? dayjs(lastUpdatedAt).format('YYYY-MM-DDTHH:mm:ss')
      : null;
    const paymentDate = hasPayGovResponse
      ? dayjs(lastUpdatedAt).format('YYYY-MM-DD')
      : null;

    return {
      agency_tracking_id: generateAgencyTrackingId(),
      paygov_tracking_id: faker.datatype.boolean() ? faker.string.alphanumeric({ length: 20, casing: 'upper' }) : null,
      fee_id: fee.feeId,
      transaction_amount: fee.amount!,
      client_name: overrides.clientName ?? faker.helpers.arrayElement(clientNames),
      transaction_reference_id: transactionReferenceId,
      payment_status,
      transaction_status: getTransactionStatus(payment_status),
      payment_method: faker.helpers.arrayElement(paymentMethods),
      paygov_token: faker.datatype.boolean() ? faker.string.uuid().replace(/-/g, '') : null,
      transaction_date: transactionDate,
      payment_date: paymentDate,
      return_code: payment_status === 'failed' ? faker.helpers.arrayElement(returnCodes) : null,
      return_detail: payment_status === 'failed' ? faker.helpers.arrayElement(returnDetails) : null,
      metadata: maybeMetadata,
      created_at: createdAt,
      last_updated_at: lastUpdatedAt,
    };
  };

  const makeMultiAttemptGroup = (outcomes: Array<'success' | 'failed' | 'pending'>): TransactionRow[] => {
    const transactionReferenceId = faker.string.uuid();
    const fee = faker.helpers.arrayElement(feesList);
    const clientName = faker.helpers.arrayElement(clientNames);
    const baseDate = dayjs().subtract(faker.number.int({ min: 3, max: 20 }), 'day');
    let elapsed = 0;
    return outcomes.map((outcome) => {
      const createdAt = baseDate.add(elapsed, 'minute').toISOString();
      elapsed += faker.number.int({ min: 20, max: 60 });
      return makeRow(outcome, { transactionReferenceId, fee, clientName, createdAt });
    });
  };

  const multiAttemptRows = Array.from({ length: multiAttemptGroups }, () =>
    makeMultiAttemptGroup(['failed', 'success']),
  ).flat();

  return [
    ...Array.from({ length: successTransactions }, () => makeRow('success')),
    ...Array.from({ length: failedTransactions }, () => makeRow('failed')),
    ...Array.from({ length: pendingTransactions }, () => makeRow('pending')),
    ...multiAttemptRows,
  ];
};
