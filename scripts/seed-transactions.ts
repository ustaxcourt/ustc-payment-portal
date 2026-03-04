#!/usr/bin/env ts-node

import { Client } from 'pg';
import { randomUUID } from 'crypto';

// Configuration
const NUM_TRANSACTIONS = 500;
const DAYS_BACK = 30;

const CLIENT_APPS = ['dawson', 'efiling', 'public-portal'];
const FEE_CODES = ['FILING_FEE', 'APPEAL_FEE', 'MOTION_FEE', 'COPY_FEE'];

// Status distribution
const STATUS_DISTRIBUTION = [
  { status: 'COMPLETED', weight: 0.80 },
  { status: 'FAILED', weight: 0.15 },
  { status: 'PENDING', weight: 0.05 },
];

interface Transaction {
  id: string;
  client_app: string;
  external_reference_id: string;
  fee_code: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get random element from array
 */
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random status based on weighted distribution
 */
function getRandomStatus(): string {
  const random = Math.random();
  let cumulative = 0;

  for (const { status, weight } of STATUS_DISTRIBUTION) {
    cumulative += weight;
    if (random < cumulative) {
      return status;
    }
  }

  return 'COMPLETED'; // Fallback
}

/**
 * Generate a random timestamp within the last N days
 */
function randomTimestamp(daysBack: number): Date {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const randomMs = Math.random() * daysBack * msPerDay;
  return new Date(now.getTime() - randomMs);
}

/**
 * Generate dummy transaction data
 */
function generateTransaction(index: number): Transaction {
  const client_app = randomElement(CLIENT_APPS);
  const created_at = randomTimestamp(DAYS_BACK);
  const updated_at = new Date(created_at.getTime() + randomInt(0, 60000)); // 0-60 seconds after creation

  return {
    id: randomUUID(),
    client_app,
    external_reference_id: `${client_app}-${Date.now()}-${index}-${randomInt(1000, 9999)}`,
    fee_code: randomElement(FEE_CODES),
    amount_cents: randomInt(1000, 50000), // $10.00 to $500.00
    currency: 'USD',
    status: getRandomStatus(),
    created_at,
    updated_at,
  };
}

/**
 * Main seeding function
 */
async function seedTransactions() {
  const DATABASE_URL = process.env.DATABASE_URL;
  const SEED_MODE = process.env.SEED_MODE;

  if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is required');
    console.error('Usage: DATABASE_URL=postgresql://... npm run seed:transactions');
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    // Delete existing rows if in dev mode
    if (SEED_MODE === 'dev') {
      console.log('🗑️  SEED_MODE=dev: Deleting existing transactions...');
      const deleteResult = await client.query('DELETE FROM transactions');
      console.log(`✅ Deleted ${deleteResult.rowCount} existing transactions`);
    }

    // Generate transactions
    console.log(`📊 Generating ${NUM_TRANSACTIONS} dummy transactions...`);
    const transactions: Transaction[] = [];
    for (let i = 0; i < NUM_TRANSACTIONS; i++) {
      transactions.push(generateTransaction(i));
    }
    console.log('✅ Generated transaction data');

    // Build batch insert query
    console.log('💾 Inserting transactions into database...');

    const values: any[] = [];
    const valuePlaceholders: string[] = [];

    transactions.forEach((txn, index) => {
      const offset = index * 9;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );
      values.push(
        txn.id,
        txn.client_app,
        txn.external_reference_id,
        txn.fee_code,
        txn.amount_cents,
        txn.currency,
        txn.status,
        txn.created_at,
        txn.updated_at
      );
    });

    const insertQuery = `
      INSERT INTO transactions (
        id,
        client_app,
        external_reference_id,
        fee_code,
        amount_cents,
        currency,
        status,
        created_at,
        updated_at
      ) VALUES ${valuePlaceholders.join(', ')}
    `;

    await client.query(insertQuery, values);
    console.log(`✅ Inserted ${NUM_TRANSACTIONS} transactions`);

    // Print summary statistics
    const statsResult = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM transactions
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log('\n📈 Transaction Status Summary:');
    statsResult.rows.forEach((row) => {
      console.log(`   ${row.status.padEnd(15)} ${row.count.toString().padStart(4)} (${row.percentage}%)`);
    });

    const dateRangeResult = await client.query(`
      SELECT
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM transactions
    `);

    console.log('\n📅 Date Range:');
    console.log(`   Earliest: ${dateRangeResult.rows[0].earliest}`);
    console.log(`   Latest:   ${dateRangeResult.rows[0].latest}`);

    console.log('\n🎉 Seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the seeding function
seedTransactions();
