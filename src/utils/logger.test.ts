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

  function mutableEnv() {
    return process.env as Record<string, string | undefined>;
  }

  beforeAll(() => {
    // pino-pretty transport setup adds process listeners per import in test mode.
    // Raise the ceiling for this suite to avoid noisy false-positive warnings.
    process.setMaxListeners(Math.max(process.getMaxListeners(), 64));
  });

  async function loadLoggerModule(): Promise<LoggerModule> {
    loadedModule = await import("./logger");
    return loadedModule;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOG_LEVEL;
    mutableEnv().APP_ENV = "test";
    delete mutableEnv().STAGE;
    loadedModule = undefined;
  });

  afterEach(async () => {
    try {
      if (!loadedModule) return;

      loadedModule.logger.flush();
      await new Promise((r) => setImmediate(r));

      const transport = (loadedModule.logger as any).transport;
      if (transport?.end) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };

          transport.on?.("close", finish);
          transport.end();
          setImmediate(finish);
        });
      }
    } finally {
      jest.restoreAllMocks();
    }
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ===========================================================================
  // pino-pretty transport
  // ===========================================================================

  describe("pino-pretty transport", () => {
    it("configures pino-pretty transport for local APP_ENV", async () => {
      process.env.NODE_ENV = "development";
      mutableEnv().APP_ENV = "local";

      const fakeLogger = {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
        child: jest.fn().mockReturnThis(),
        bindings: jest.fn(() => ({})),
        flush: jest.fn(),
      };

      const pinoFactory = Object.assign(
        jest.fn(() => fakeLogger),
        {
          stdTimeFunctions: { isoTime: jest.fn() },
        },
      );

      jest.resetModules();
      jest.doMock("pino", () => ({ __esModule: true, default: pinoFactory }));

      try {
        const loggerModule = await import("./logger");

        expect(pinoFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            transport: expect.objectContaining({ target: "pino-pretty" }),
          }),
        );

        loggerModule.logger.info("pretty test");
        expect(fakeLogger.info).toHaveBeenCalledWith("pretty test");
      } finally {
        jest.dontMock("pino");
        jest.resetModules();
      }
    });

    it("does not configure pino-pretty transport for deployed APP_ENV", async () => {
      process.env.NODE_ENV = "development";
      mutableEnv().APP_ENV = "dev";

      const fakeLogger = {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
        child: jest.fn().mockReturnThis(),
        bindings: jest.fn(() => ({})),
        flush: jest.fn(),
      };

      const pinoFactory = Object.assign(
        jest.fn(() => fakeLogger),
        {
          stdTimeFunctions: { isoTime: jest.fn() },
        },
      );

      jest.resetModules();
      jest.doMock("pino", () => ({ __esModule: true, default: pinoFactory }));

      try {
        await import("./logger");

        expect(pinoFactory).toHaveBeenCalledWith(
          expect.objectContaining({ transport: undefined }),
        );
      } finally {
        jest.dontMock("pino");
        jest.resetModules();
      }
    });

    describe.each(["test", "development", "production"] as const)(
      "NODE_ENV=%s",
      (nodeEnv) => {
        APP_ENVS.forEach((appEnv) => {
          it(`routes output correctly for APP_ENV=${appEnv}`, async () => {
            process.env.NODE_ENV = nodeEnv;
            mutableEnv().APP_ENV = appEnv;

            const stdoutSpy = jest
              .spyOn(process.stdout, "write")
              .mockReturnValue(true as never);

            const { logger } = await loadLoggerModule();
            logger.error("routing test");

            const output = stdoutSpy.mock.calls
              .map(([chunk]) => String(chunk))
              .join("\n");

            if (appEnv === "local") {
              expect(output).toBe("");
              expect(stdoutSpy).not.toHaveBeenCalled();
            } else {
              expect(output).toContain("routing test");
              expect(stdoutSpy).toHaveBeenCalled();
            }
          });
        });
      },
    );
  });

  // ===========================================================================
  // log emission by level
  // ===========================================================================

  describe("log emission by level", () => {
    describe.each(["test", "production"] as const)("NODE_ENV=%s", (nodeEnv) => {
      PINO_LEVELS.forEach((logLevel) => {
        it(`emits logs ≥ ${logLevel}`, async () => {
          process.env.NODE_ENV = nodeEnv;
          mutableEnv().APP_ENV = nodeEnv === "test" ? "test" : "dev";
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
        mutableEnv().APP_ENV = "local";

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

            const shouldPretty = mutableEnv().APP_ENV === "local";

            const stdoutSpy = shouldPretty
              ? null
              : jest
                  .spyOn(process.stdout, "write")
                  .mockReturnValue(true as never);

            const { logger } = await loadLoggerModule();

            if (level === "silent") {
              expect(logger.level).toBe(defaultLevel);
              return;
            }

            // Call the log method
            (logger as any)[level](`unset ${level}`);

            if (shouldPretty) {
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
            mutableEnv().APP_ENV = appEnv;

            const stdoutSpy = jest
              .spyOn(process.stdout, "write")
              .mockReturnValue(true as never);

            const { logger } = await loadLoggerModule();
            logger.error("stage check");

            const output = stdoutSpy.mock.calls
              .map(([c]) => String(c))
              .join("\n");

            if (appEnv === "local") {
              expect(output).toBe("");
              expect(stdoutSpy).not.toHaveBeenCalled();
            } else {
              expect(output).toContain(`"appEnv":"${appEnv}"`);
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

        it("normalizes uppercase LOG_LEVEL values", async () => {
          process.env.LOG_LEVEL = "WARN";

          const { logger } = await loadLoggerModule();
          expect(logger.level).toBe("warn");
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

    it("warns and falls back when NODE_ENV is invalid", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "qa";

      const stderrSpy = jest
        .spyOn(process.stderr, "write")
        .mockReturnValue(true as never);

      const { logger } = await loadLoggerModule();

      expect(logger.level).toBe("debug");
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid NODE_ENV="qa"'),
      );
    });

    it("redacts nested sensitive fields", async () => {
      process.env.NODE_ENV = "production";
      mutableEnv().APP_ENV = "dev";

      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockReturnValue(true as never);

      const { logger } = await loadLoggerModule();
      logger.info(
        {
          authorization: "Bearer top-level",
          token: "top-level-token",
          request: {
            headers: {
              authorization: "Bearer nested",
            },
          },
          payload: {
            nested: {
              token: "token-value",
              password: "password-value",
              secret: "secret-value",
              certPassphrase: "cert-passphrase-value",
            },
          },
        },
        "redaction check",
      );

      const output = stdoutSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join("\n");

      expect(output).toContain("[Redacted]");
      expect(output).not.toContain("Bearer top-level");
      expect(output).not.toContain("top-level-token");
      expect(output).not.toContain("Bearer nested");
      expect(output).not.toContain("token-value");
      expect(output).not.toContain("password-value");
      expect(output).not.toContain("secret-value");
      expect(output).not.toContain("cert-passphrase-value");
    });

    it("preserves non-object array values while redacting nested sensitive fields", async () => {
      process.env.NODE_ENV = "production";
      mutableEnv().APP_ENV = "dev";

      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockReturnValue(true as never);

      const { logger } = await loadLoggerModule();
      logger.info(
        {
          payload: ["plain-text", 42, false, { token: "array-token" }],
        },
        "array redaction check",
      );

      const output = stdoutSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join("\n");

      expect(output).toContain("plain-text");
      expect(output).toContain("42");
      expect(output).toContain("false");
      expect(output).toContain("[Redacted]");
      expect(output).not.toContain("array-token");
    });

    it("throws when APP_ENV is unset even if legacy STAGE is present", async () => {
      process.env.NODE_ENV = "production";
      delete mutableEnv().APP_ENV;
      mutableEnv().STAGE = "stg";

      await expect(loadLoggerModule()).rejects.toThrow("APP_ENV is not set");
    });
  });

  // ===========================================================================
  // createRequestLogger
  // ===========================================================================

  describe("createRequestLogger", () => {
    describe.each(["test", "development", "production"] as const)(
      "NODE_ENV=%s",
      (nodeEnv) => {
        it("binds request context fields", async () => {
          process.env.NODE_ENV = nodeEnv;
          mutableEnv().APP_ENV = "dev";

          const { createRequestLogger } = await loadLoggerModule();

          const child = createRequestLogger({
            awsRequestId: "req-123",
            path: "/payments/init",
            httpMethod: "POST",
            logLevel: "info",
          });

          expect(child.bindings()).toEqual(
            expect.objectContaining({
              awsRequestId: "req-123",
              path: "/payments/init",
              httpMethod: "POST",
            }),
          );
        });
      },
    );
  });
});
