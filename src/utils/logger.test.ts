const ORIGINAL_ENV = process.env;

describe("Pino logger", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOG_LEVEL;
    delete process.env.STAGE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function loadLoggerModule() {
    return import("./logger");
  }

  it("uses error level by default in test environment", async () => {
    process.env.NODE_ENV = "test";

    const { logger } = await loadLoggerModule();

    expect(logger.level).toBe("error");
  });

  it("uses info level by default in staging environment", async () => {
    process.env.NODE_ENV = "staging";

    const { logger } = await loadLoggerModule();

    expect(logger.level).toBe("info");
  });

  it("uses LOG_LEVEL override when valid", async () => {
    process.env.NODE_ENV = "staging";
    process.env.LOG_LEVEL = "warn";

    const { logger } = await loadLoggerModule();

    expect(logger.level).toBe("warn");
  });

  it("falls back to environment default when LOG_LEVEL is invalid", async () => {
    process.env.NODE_ENV = "staging";
    process.env.LOG_LEVEL = "invalid-level";

    const stderrSpy = jest
      .spyOn(process.stderr, "write")
      .mockReturnValue(true as never);

    const { logger } = await loadLoggerModule();

    expect(logger.level).toBe("info");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid LOG_LEVEL="invalid-level"'),
    );

    stderrSpy.mockRestore();
  });

  it("creates a request child logger with bound context", async () => {
    process.env.NODE_ENV = "staging";
    process.env.STAGE = "dev";

    const { createRequestLogger } = await loadLoggerModule();

    const requestLogger = createRequestLogger({
      awsRequestId: "req-123",
      path: "/payments/init",
      httpMethod: "POST",
      clientArn: "arn:aws:iam::123456789012:role/example-client",
      transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
    });

    const bindings = requestLogger.bindings();

    expect(bindings).toEqual(
      expect.objectContaining({
        awsRequestId: "req-123",
        path: "/payments/init",
        httpMethod: "POST",
        clientArn: "arn:aws:iam::123456789012:role/example-client",
        transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
      }),
    );
  });
});
