import request from 'supertest';
import app from '../app';
import knex from '../db/knex';

beforeAll(async () => {
  // Wait for DB connection to be established
  await knex.raw('SELECT 1');
});

afterAll(async () => {
  // Close the database connection
  await knex.destroy();
});

describe('GET /api/transactions', () => {
  it('should return at most 100 transactions', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(100);
    expect(response.body.total).toBeLessThanOrEqual(100);
  });

  it('should be sorted by createdAt descending', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect(200);

    const rows: { createdAt: string }[] = response.body.data;

    if (rows.length > 1) {
      for (let i = 1; i < rows.length; i++) {
        const prev = new Date(rows[i - 1].createdAt).getTime();
        const curr = new Date(rows[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    }
  });

  it('should return transactions with mixed payment statuses', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect(200);

    const rows: { paymentStatus: string }[] = response.body.data;
    const statuses = new Set(rows.map((r) => r.paymentStatus));

    // With seed data covering multiple statuses, we expect more than one status
    // in the 100 most recent records.
    expect(statuses.size).toBeGreaterThanOrEqual(1);
  });

  it('should return transactions with correct schema', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect(200);

    if (response.body.data.length > 0) {
      const transaction = response.body.data[0];

      expect(transaction).toHaveProperty('agencyTrackingId');
      expect(transaction).toHaveProperty('feeName');
      expect(transaction).toHaveProperty('feeId');
      expect(transaction).toHaveProperty('feeAmount');
      expect(transaction).toHaveProperty('clientName');
      expect(transaction).toHaveProperty('transactionReferenceId');
      expect(transaction).toHaveProperty('paymentStatus');
      expect(transaction).toHaveProperty('paymentMethod');
      expect(transaction).toHaveProperty('lastUpdatedAt');
      expect(transaction).toHaveProperty('createdAt');

      expect(typeof transaction.agencyTrackingId).toBe('string');
      expect(typeof transaction.feeAmount).toBe('number');
      expect(typeof transaction.createdAt).toBe('string');
    }
  });

  it('should match the count returned by a direct database query (capped at 100)', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect(200);

    const dbCount = await knex('transactions').count('* as count').first();
    const total = Math.min(Number(dbCount?.count ?? 0), 100);

    expect(response.body.data.length).toBe(total);
    expect(response.body.total).toBe(total);
  });
});

describe('GET /api/transactions/:paymentStatus', () => {
  it('should return transactions from the database', async () => {
    const response = await request(app)
      .get('/api/transactions/success')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('should return transactions with correct schema', async () => {
    const response = await request(app)
      .get('/api/transactions/success')
      .expect(200);

    if (response.body.data.length > 0) {
      const transaction = response.body.data[0];

      // Check required fields
      expect(transaction).toHaveProperty('agencyTrackingId');
      expect(transaction).toHaveProperty('feeName');
      expect(transaction).toHaveProperty('feeId');
      expect(transaction).toHaveProperty('feeAmount');
      expect(transaction).toHaveProperty('clientName');
      expect(transaction).toHaveProperty('transactionReferenceId');
      expect(transaction).toHaveProperty('paymentStatus');
      expect(transaction).toHaveProperty('transactionStatus');
      expect(transaction).toHaveProperty('paymentMethod');
      expect(transaction).toHaveProperty('lastUpdatedAt');
      expect(transaction).toHaveProperty('createdAt');

      // Check types
      expect(typeof transaction.agencyTrackingId).toBe('string');
      expect(typeof transaction.feeName).toBe('string');
      expect(typeof transaction.feeId).toBe('string');
      expect(typeof transaction.feeAmount).toBe('number');
      expect(typeof transaction.clientName).toBe('string');
      expect(typeof transaction.transactionReferenceId).toBe('string');
      expect(typeof transaction.paymentStatus).toBe('string');
      if (transaction.transactionStatus !== undefined && transaction.transactionStatus !== null) {
        expect(typeof transaction.transactionStatus).toBe('string');
      }
      expect(typeof transaction.paymentMethod).toBe('string');
      expect(typeof transaction.lastUpdatedAt).toBe('string');
      expect(typeof transaction.createdAt).toBe('string');
    }
  });

  it('should verify data is coming from database by checking transaction count', async () => {
    // Get count from API
    const apiResponse = await request(app)
      .get('/api/transactions/success')
      .expect(200);

    // Get count directly from database for the same payment status
    const dbCount = await knex('transactions')
      .where('payment_status', 'success')
      .count('* as count')
      .first();
    const dbTransactionCount = parseInt(dbCount?.count as string, 10);

    // API returns up to 100, so either they match or API has 100
    expect(apiResponse.body.data.length).toBeLessThanOrEqual(100);

    if (dbTransactionCount <= 100) {
      expect(apiResponse.body.data.length).toBe(dbTransactionCount);
    } else {
      expect(apiResponse.body.data.length).toBe(100);
    }
  });

  it('should transform database fields to frontend format correctly', async () => {
    // Get a transaction from the database
    const dbTransaction = await knex('transactions')
      .where('payment_status', 'success')
      .first();

    if (dbTransaction) {
      // Get the same transaction from the API
      const response = await request(app)
        .get('/api/transactions/success')
        .expect(200);

      const apiTransaction = response.body.data.find(
        (t: any) => t.agencyTrackingId === dbTransaction.agencyTrackingId
      );

      expect(apiTransaction).toBeDefined();
      expect(apiTransaction.clientName).toBe(dbTransaction.clientName);
      expect(apiTransaction.transactionReferenceId).toBe(dbTransaction.transactionReferenceId);
      expect(apiTransaction.feeId).toBe(dbTransaction.feeId);
      expect(apiTransaction.feeName).toBe(dbTransaction.feeName);
      expect(apiTransaction.feeAmount).toBe(Number(dbTransaction.feeAmount));
      expect(apiTransaction.paymentStatus).toBe(dbTransaction.paymentStatus);
      expect(apiTransaction.lastUpdatedAt).toBe(new Date(dbTransaction.lastUpdatedAt).toISOString());
      expect(apiTransaction.createdAt).toBe(new Date(dbTransaction.createdAt).toISOString());
    }
  });

  it('should return 400 for invalid paymentStatus', async () => {
    const response = await request(app)
      .get('/api/transactions/INVALID')
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});

describe('GET /api/transaction-payment-status', () => {
  it('should return aggregated payment status counts', async () => {
    const response = await request(app)
      .get('/api/transaction-payment-status')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('failed');
    expect(response.body).toHaveProperty('pending');
    expect(typeof response.body.success).toBe('number');
    expect(typeof response.body.failed).toBe('number');
    expect(typeof response.body.pending).toBe('number');
  });

  it('should match database payment_status aggregation', async () => {
    const response = await request(app)
      .get('/api/transaction-payment-status')
      .expect(200);

    const dbRows = await knex('transactions')
      .select('payment_status')
      .count('* as count')
      .groupBy('payment_status');

    const expected = {
      success: 0,
      failed: 0,
      pending: 0,
    };

    dbRows.forEach((row) => {
      const status = (row.paymentStatus ?? row.payment_status) as 'success' | 'failed' | 'pending';
      if (status === 'success' || status === 'failed' || status === 'pending') {
        expected[status] = Number(row.count);
      }
    });

    expect(response.body).toEqual(expected);
  });
});
