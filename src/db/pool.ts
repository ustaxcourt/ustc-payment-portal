import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;
let databaseUrl: string | null = null;

/**
 * Construct DATABASE_URL from RDS credentials in Secrets Manager
 */
async function getDatabaseUrl(): Promise<string> {
  if (databaseUrl) {
    return databaseUrl;
  }

  // Check if DATABASE_URL is directly provided (for local development)
  if (process.env.DATABASE_URL) {
    databaseUrl = process.env.DATABASE_URL;
    return databaseUrl;
  }

  // Construct from RDS_ENDPOINT and RDS_SECRET_ARN (for production)
  const rdsEndpoint = process.env.RDS_ENDPOINT;
  const rdsSecretArn = process.env.RDS_SECRET_ARN;

  if (!rdsEndpoint || !rdsSecretArn) {
    throw new Error('Either DATABASE_URL or both RDS_ENDPOINT and RDS_SECRET_ARN must be set');
  }

  // Fetch credentials from Secrets Manager
  const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const command = new GetSecretValueCommand({ SecretId: rdsSecretArn });
  const response = await secretsClient.send(command);

  if (!response.SecretString) {
    throw new Error('RDS credentials secret is empty');
  }

  const credentials = JSON.parse(response.SecretString);
  const { username, password } = credentials;

  // Extract host and port from RDS endpoint (format: host:port)
  const [host, port = '5432'] = rdsEndpoint.split(':');

  // Construct PostgreSQL connection URL
  databaseUrl = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/paymentportal`;

  return databaseUrl;
}

/**
 * Get singleton PostgreSQL connection pool
 * Reuses the same pool across Lambda invocations
 */
export async function getDbPool(): Promise<Pool> {
  if (!pool) {
    const connectionString = await getDatabaseUrl();

    pool = new Pool({
      connectionString,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Fail fast if connection takes > 2 seconds
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
    });
  }

  return pool;
}

/**
 * Close the database pool (useful for cleanup in tests)
 */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    databaseUrl = null;
  }
}
