import { createLogger } from "../utils/logger";

describe("createLogger (pino)", () => {
  let writeSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
    // Capture stdout so we can assert logs
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test("logs a basic message", () => {
    const logger = createLogger();

    logger.info("hello world");

    expect(writeSpy).toHaveBeenCalled();

    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain("hello world");
    expect(output).toContain("info");
  });

  test("includes context object", () => {
    const logger = createLogger();

    logger.info({ context: { foo: "bar" } }, "test message");

    const output = writeSpy.mock.calls[0][0] as string;

    expect(output).toContain("foo");
    expect(output).toContain("bar");
  });

  test("redacts sensitive fields", () => {
    const logger = createLogger();

    logger.info({
      user: { token: "secret-token" },
    });

    const output = writeSpy.mock.calls[0][0] as string;

    expect(output).not.toContain("secret-token");
  });

  test("removes duplicate context values", () => {
    const logger = createLogger();

    logger.info({
      foo: "bar",
      context: { foo: "bar" },
    });

    const output = writeSpy.mock.calls[0][0] as string;

    // context.foo should be removed since it's duplicate
    expect(output).toContain('"foo":"bar"');
    expect(output).not.toContain('"context":{"foo":"bar"}');
  });

  test("logs error with stack", () => {
    const logger = createLogger();

    const error = new Error("boom");

    logger.error({ err: error });

    const output = writeSpy.mock.calls[0][0] as string;

    expect(output).toContain("boom");
    expect(output).toContain("stack");
  });

  test("respects log level", () => {
    process.env.LOG_LEVEL = "error";

    const logger = createLogger();

    logger.info("should not log");

    expect(writeSpy).not.toHaveBeenCalled();

    logger.error("should log");

    expect(writeSpy).toHaveBeenCalled();
  });

  test("adds base metadata", () => {
    const logger = createLogger({
      base: { service: "test-service" },
    });

    logger.info("hello");

    const output = writeSpy.mock.calls[0][0] as string;

    expect(output).toContain("test-service");
  });
});
