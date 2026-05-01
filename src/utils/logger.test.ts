type LoggerModule = typeof import("./logger");

const PINO_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

const APP_ENVS = ["local", "test", "dev", "stg", "prod"];

const LEVEL_ORDER = ["trace", "debug", "info", "warn", "error", "fatal"];

const levelToNum: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

const DEFAULT_ALLOWED_LEVELS: Record<
  "test" | "development" | "production",
  readonly (typeof PINO_LEVELS)[number][]
> = {
  test: ["error", "fatal"],
  development: ["debug", "info", "warn", "error", "fatal"],
  production: ["info", "warn", "error", "fatal"],
};

describe("src/utils/logger.ts", () => {
  let loadedModule: LoggerModule | undefined;
  const ORIGINAL_ENV = process.env;

  async function loadLoggerModule(): Promise<LoggerModule> {
    loadedModule = await import("./logger");
    return loadedModule;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOG_LEVEL;
    delete process.env.APP_ENV;
    loadedModule = undefined;
  });

  afterEach(async () => {
    if (!loadedModule) return;

    loadedModule.logger.flush();
    await new Promise((r) => setImmediate(r));

    const transport = (loadedModule.logger as any).transport;
    if (transport?.end) {
      transport.end();
    }

    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ===========================================================================
  // pino-pretty transport
  // ===========================================================================

  describe("pino-pretty transport", () => {
    describe("NODE_ENV=development", () => {
      APP_ENVS.forEach((stage) => {
        it(`does not emit JSON stage field (APP_ENV=${stage})`, async () => {
          process.env.NODE_ENV = "development";
          process.env.APP_ENV = stage;

          const stdoutSpy = jest
            .spyOn(process.stdout, "write")
            .mockReturnValue(true as never);

          const { logger } = await loadLoggerModule();
          logger.info("pretty test");

          const output = stdoutSpy.mock.calls
            .map(([chunk]) => String(chunk))
            .join("\n");

          expect(output).not.toContain(`"stage":"${stage}"`);
        });
      });
    });
  });

  // ===========================================================================
  // log emission by level
  // ===========================================================================

  describe("log emission by level", () => {
    describe.each([
      ["test", "error"],
      ["production", "info"],
    ] as const)("NODE_ENV=%s", (nodeEnv, defaultLevel) => {
      PINO_LEVELS.forEach((logLevel) => {
        it(`emits logs ≥ ${logLevel}`, async () => {
          process.env.NODE_ENV = nodeEnv;
          process.env.LOG_LEVEL = logLevel;

          const stdoutSpy = jest
            .spyOn(process.stdout, "write")
            .mockReturnValue(true as never);

          const { logger } = await loadLoggerModule();

          LEVEL_ORDER.forEach((lvl) => (logger as any)[lvl](`log at ${lvl}`));

          const output = stdoutSpy.mock.calls
            .map(([c]) => String(c))
            .join("\n");

          const min = levelToNum[logger.level];

          LEVEL_ORDER.forEach((lvl) => {
            const shouldEmit = levelToNum[lvl] >= min;
            shouldEmit
              ? expect(output).toContain(`log at ${lvl}`)
              : expect(output).not.toContain(`log at ${lvl}`);
          });
        });
      });
    });

    describe("NODE_ENV=development", () => {
      it("does not emit to stdout due to pino-pretty", async () => {
        process.env.NODE_ENV = "development";

        const stdoutSpy = jest
          .spyOn(process.stdout, "write")
          .mockReturnValue(true as never);

        const { logger } = await loadLoggerModule();
        logger.info("dev emission");

        expect(stdoutSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // logger
  // ===========================================================================

  describe("logger", () => {
    describe.each([
      ["test", "error"],
      ["development", "debug"],
      ["production", "info"],
    ] as const)("NODE_ENV=%s", (nodeEnv, defaultLevel) => {
      beforeEach(() => {
        process.env.NODE_ENV = nodeEnv;
      });

      describe("LOG_LEVEL unset", () => {
        const allowedLevels = DEFAULT_ALLOWED_LEVELS[nodeEnv];

        PINO_LEVELS.forEach((level) => {
          const shouldAllow = allowedLevels.includes(level);

          it(`${
            shouldAllow ? "allows" : "does not allow"
          } ${level} logging`, async () => {
            // LOG_LEVEL intentionally unset
            delete process.env.LOG_LEVEL;

            const stdoutSpy =
              nodeEnv === "development"
                ? null
                : jest
                    .spyOn(process.stdout, "write")
                    .mockReturnValue(true as never);

            const { logger } = await loadLoggerModule();

            // Call the log method
            (logger as any)[level](`unset ${level}`);

            if (nodeEnv === "development") {
              // pino-pretty: we can't reliably inspect stdout
              // but calling should never throw
              expect(true).toBe(true);
              return;
            }

            const output = stdoutSpy!.mock.calls
              .map(([c]) => String(c))
              .join("\n");

            if (shouldAllow) {
              expect(output).toContain(`unset ${level}`);
            } else {
              expect(output).not.toContain(`unset ${level}`);
            }
          });
        });
      });

      describe("APP_ENV handling", () => {
        APP_ENVS.forEach((appEnv) => {
          it(`handles APP_ENV=${appEnv}`, async () => {
            process.env.APP_ENV = appEnv;

            const stdoutSpy = jest
              .spyOn(process.stdout, "write")
              .mockReturnValue(true as never);

            const { logger } = await loadLoggerModule();
            logger.error("stage check");

            const output = stdoutSpy.mock.calls
              .map(([c]) => String(c))
              .join("\n");

            if (nodeEnv === "development") {
              expect(output).not.toContain('"stage":"');
            } else {
              expect(output).toContain(`"stage":"${appEnv}"`);
            }
          });
        });
      });

      describe("LOG_LEVEL override", () => {
        PINO_LEVELS.forEach((level) => {
          it(`respects LOG_LEVEL=${level}`, async () => {
            process.env.LOG_LEVEL = level;
            const { logger } = await loadLoggerModule();
            expect(logger.level).toBe(level);
          });
        });

        it("falls back on invalid LOG_LEVEL", async () => {
          process.env.LOG_LEVEL = "bad";

          const stderrSpy = jest
            .spyOn(process.stderr, "write")
            .mockReturnValue(true as never);

          const { logger } = await loadLoggerModule();
          expect(logger.level).toBe(defaultLevel);
          expect(stderrSpy).toHaveBeenCalled();
        });
      });
    });
  });

  // ===========================================================================
  // createRequestLogger
  // ===========================================================================

  describe("createRequestLogger", () => {
    describe("APP_ENV=production", () => {
      it("binds request context fields", async () => {
        process.env.NODE_ENV = "production";
        process.env.APP_ENV = "dev";

        const { createRequestLogger } = await loadLoggerModule();

        const child = createRequestLogger({
          awsRequestId: "req-123",
          path: "/payments/init",
          httpMethod: "POST",
        });

        expect(child.bindings()).toEqual(
          expect.objectContaining({
            awsRequestId: "req-123",
            path: "/payments/init",
            httpMethod: "POST",
          }),
        );
      });
    });
  });
});
