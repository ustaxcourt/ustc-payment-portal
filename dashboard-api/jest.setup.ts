const originalFetch = global.fetch

expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received)
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to be one of ${expected.map(String).join(', ')}`
          : `expected ${String(received)} to be one of ${expected.map(String).join(', ')}`,
    }
  },
})

beforeEach(() => {
  jest.useRealTimers()

  // Default fetch mock for unit tests; override per test when needed.
  global.fetch = jest.fn(async () => {
    throw new Error('global.fetch mock not implemented for this test')
  }) as unknown as typeof globalThis.fetch
})

afterEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

afterAll(() => {
  global.fetch = originalFetch
})

export { }
