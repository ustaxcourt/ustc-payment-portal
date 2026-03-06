import request from 'supertest';
import app from '../app';
import knex from '../db/knex';

describe('GET /api/transactions', () => {
  beforeAll(async () => {
    // Wait for DB connection to be established
    await knex.raw('SELECT 1');
  });

  afterAll(async () => {
    // Close the database connection
    await knex.destroy();
  });

  it('should return transactions from the database', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('should return transactions with correct schema', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .expect(200);

    if (response.body.data.length > 0) {
      const transaction = response.body.data[0];

      // Check required fields
      expect(transaction).toHaveProperty('agencyTrackingId');
      expect(transaction).toHaveProperty('feeName');
      expect(transaction).toHaveProperty('feeId');
      expect(transaction).toHaveProperty('feeAmount');
      expect(transaction).toHaveProperty('appClientName');
      expect(transaction).toHaveProperty('transactionReferenceId');
      expect(transaction).toHaveProperty('transactionStatus');
      expect(transaction).toHaveProperty('paymentMethod');
      expect(transaction).toHaveProperty('lastUpdatedAt');
      expect(transaction).toHaveProperty('createdAt');

      // Check types
      expect(typeof transaction.agencyTrackingId).toBe('string');
      expect(typeof transaction.feeName).toBe('string');
      expect(typeof transaction.feeId).toBe('string');
      expect(typeof transaction.feeAmount).toBe('number');
      expect(typeof transaction.appClientName).toBe('string');
      expect(typeof transaction.transactionReferenceId).toBe('string');
      expect(typeof transaction.transactionStatus).toBe('string');
      expect(typeof transaction.paymentMethod).toBe('string');
      expect(typeof transaction.lastUpdatedAt).toBe('string');
      expect(typeof transaction.createdAt).toBe('string');
    }
  });

  it('should verify data is coming from database by checking transaction count', async () => {
    // Get count from API
    const apiResponse = await request(app)
      .get('/api/transactions')
      .expect(200);

    // Get count directly from database
    const dbCount = await knex('transactions').count('* as count').first();
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
    const dbTransaction = await knex('transactions').first();

    if (dbTransaction) {
      // Get the same transaction from the API
      const response = await request(app)
        .get('/api/transactions')
        .expect(200);

      const apiTransaction = response.body.data.find(
        (t: any) => t.agencyTrackingId === dbTransaction.id
      );

      expect(apiTransaction).toBeDefined();
      expect(apiTransaction.appClientName).toBe(dbTransaction.client_app);
      expect(apiTransaction.transactionReferenceId).toBe(dbTransaction.external_reference_id);
      expect(apiTransaction.feeId).toBe(dbTransaction.fee_code);
      expect(apiTransaction.feeName).toBe(dbTransaction.fee_code);
      expect(apiTransaction.feeAmount).toBe(dbTransaction.amount_cents / 100);
    }
  });
});
