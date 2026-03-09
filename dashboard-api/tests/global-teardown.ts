import type { Knex } from 'knex'
import type { Server } from 'http'

export default async function globalTeardown(): Promise<void> {
  // Example: close a shared HTTP server started in global setup.
  const maybeServer = (globalThis as any).__TEST_HTTP_SERVER__ as Server | undefined
  if (maybeServer && maybeServer.listening) {
    await new Promise<void>((resolve, reject) => {
      maybeServer.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  // Example: close a shared DB connection started in global setup.
  const maybeDb = (globalThis as any).__TEST_DB_CONNECTION__ as Knex | undefined
  if (maybeDb) {
    await maybeDb.destroy()
  }
}
