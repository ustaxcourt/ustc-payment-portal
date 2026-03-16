import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getRecentTransactions,
  getTransactionsByStatus,
  getTransactionPaymentStatus,
  isValidPaymentStatus,
} from '../../useCases/transactions';

const ok = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const clientError = (status: number, message: string): APIGatewayProxyResult => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: { message } }),
});

const serverError = (err: unknown): APIGatewayProxyResult => {
  console.error('[Dashboard] Unhandled error:', err);
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: { message: 'Internal server error' } }),
  };
};

/**
 * GET /transactions
 * Returns the 100 most recent transactions across all statuses.
 */
export const getAllTransactionsHandler = async (): Promise<APIGatewayProxyResult> => {
  try {
    return ok(await getRecentTransactions());
  } catch (err) {
    return serverError(err);
  }
};

/**
 * GET /transactions/:paymentStatus
 * Returns up to 100 transactions filtered by payment status.
 */
export const getTransactionsByStatusHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const paymentStatus = event.pathParameters?.paymentStatus;

  if (!paymentStatus || !isValidPaymentStatus(paymentStatus)) {
    return clientError(400, 'Invalid paymentStatus. Expected one of: pending, success, failed');
  }

  try {
    return ok(await getTransactionsByStatus(paymentStatus));
  } catch (err) {
    return serverError(err);
  }
};

/**
 * GET /transaction-payment-status
 * Returns aggregated counts per payment status plus a capped total.
 */
export const getTransactionPaymentStatusHandler = async (): Promise<APIGatewayProxyResult> => {
  try {
    return ok(await getTransactionPaymentStatus());
  } catch (err) {
    return serverError(err);
  }
};
