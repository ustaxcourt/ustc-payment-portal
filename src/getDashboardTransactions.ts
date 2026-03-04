import { APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { getDbPool } from './db/pool';

interface Transaction {
  id: string;
  client_app: string;
  external_reference_id: string;
  fee_code: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DashboardTransactionsResponse {
  data: Transaction[];
  count: number;
}

/**
 * Lambda handler for GET /dashboard/transactions
 * Returns the latest 100 transactions ordered by created_at DESC, id DESC
 */
export const getDashboardTransactionsHandler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext?.requestId || 'unknown';

  try {
    const pool = await getDbPool();

    // Query latest 100 transactions with parameterized limit
    const query = `
      SELECT
        id,
        client_app,
        external_reference_id,
        fee_code,
        amount_cents,
        currency,
        status,
        created_at,
        updated_at
      FROM transactions
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `;

    const result = await pool.query<Transaction>(query, [100]);

    const response: DashboardTransactionsResponse = {
      data: result.rows,
      count: result.rows.length,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    // Log structured error with requestId
    console.error(
      JSON.stringify({
        message: 'Database error in getDashboardTransactions',
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        requestId,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }
};
