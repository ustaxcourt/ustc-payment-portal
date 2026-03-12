import type { Knex } from 'knex'
import knexFactory from 'knex'
import knexConfig from '../knexfile'

export default async function globalSetup(): Promise<void> {
  // Force test env for all integration tests.
  process.env.NODE_ENV = 'test'

  // Optional place to inject test-only env defaults.
  process.env.API_PORT ??= '3001'

  const config = knexConfig.test as Knex.Config | undefined
  if (!config) {
    throw new Error('Missing knex test config for Jest global setup')
  }

  // Validate DB connectivity before test suites run.
  const knex = knexFactory(config)
  try {
    await knex.raw('SELECT 1')
  } finally {
    await knex.destroy()
  }

  // Example for starting shared resources if needed:
  // const server = app.listen(0)
  // ;(globalThis as any).__TEST_HTTP_SERVER__ = server
}
