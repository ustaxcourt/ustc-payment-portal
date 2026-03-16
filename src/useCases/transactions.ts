import TransactionModel, {
  AggregatedPaymentStatus,
  PaymentStatus,
} from '../dashboard/models/TransactionModel';

export type TransactionsResponse = {
  data: TransactionModel[];
  total: number;
};

const ALLOWED_PAYMENT_STATUSES = new Set<PaymentStatus>(['pending', 'success', 'failed']);

export function isValidPaymentStatus(value: string): value is PaymentStatus {
  return ALLOWED_PAYMENT_STATUSES.has(value as PaymentStatus);
}

/**
 * Returns the 100 most recent transactions across all statuses.
 */
export async function getRecentTransactions(): Promise<TransactionsResponse> {
  const data = await TransactionModel.getAll();
  return { data, total: data.length };
}

/**
 * Returns up to 100 transactions filtered by payment status.
 */
export async function getTransactionsByStatus(
  paymentStatus: PaymentStatus
): Promise<TransactionsResponse> {
  const data = await TransactionModel.getByPaymentStatus(paymentStatus);
  return { data, total: data.length };
}

/**
 * Returns aggregated counts per payment status plus a capped total.
 */
export async function getTransactionPaymentStatus(): Promise<AggregatedPaymentStatus> {
  return TransactionModel.getAggregatedPaymentStatus();
}
