const { Client } = require('pg')

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || '5433')
const DB_USER = process.env.DB_USER || 'user'
const DB_PASSWORD = process.env.DB_PASSWORD || 'password'
const BASE_DB_NAME = process.env.DB_NAME || 'mydb'
const TEST_DB_NAME = `${BASE_DB_NAME}_test`

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid database name: ${identifier}`)
  }
  return `"${identifier.replace(/"/g, '""')}"`
}

async function ensureTestDatabase() {
  const adminClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres',
  })

  await adminClient.connect()

  try {
    const existsResult = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME]
    )

    if (existsResult.rowCount && existsResult.rowCount > 0) {
      console.log(`Test database already exists: ${TEST_DB_NAME}`)
      return
    }

    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(TEST_DB_NAME)}`)
    console.log(`Created test database: ${TEST_DB_NAME}`)
  } finally {
    await adminClient.end()
  }
}

ensureTestDatabase().catch((error) => {
  console.error('Failed to ensure test database exists')
  console.error(error)
  process.exit(1)
})
