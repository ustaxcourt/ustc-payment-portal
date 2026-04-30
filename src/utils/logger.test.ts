const ORIGINAL_ENV = process.env;
const PINO_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

type LoggerModule = typeof import("./logger");

describe("src/utils/logger.ts", () => {
  let loadedModule: LoggerModule | undefined;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOG_LEVEL;
    delete process.env.STAGE;
    loadedModule = undefined;
  });

  afterEach(async () => {
    if (loadedModule) {
      await new Promise<void>((resolve) => {
        loadedModule!.logger.flush();
        setImmediate(resolve);
      });

      const transport = (
        loadedModule.logger as unknown as {
          transport?: {
            end?: () => void;
            on?: (event: string, listener: () => void) => void;
          };
        }
      ).transport;

      if (transport?.end) {
        const endTransport = transport.end;
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };

          transport.on?.("close", finish);
          endTransport();
          setImmediate(finish);
        });
      }
    }

    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function loadLoggerModule(): Promise<LoggerModule> {
    loadedModule = await import("./logger");
    return loadedModule;
  }

  describe("logger", () => {
    describe.each([
      ["test", "error"],
      ["development", "debug"],
      ["production", "info"],
    ] as const)("NODE_ENV=%s", (nodeEnv, defaultLevel) => {
      beforeEach(() => {
        process.env.NODE_ENV = nodeEnv;
      });

      it(`uses ${defaultLevel} as default level`, async () => {
        const { logger } = await loadLoggerModule();
        expect(logger.level).toBe(defaultLevel);
      });

      // STAGE permutations as individual 'it' blocks
      (["dev", "stg", "prod"] as const).forEach((stage) => {
        it(`includes stage '${stage}' in non-pretty logs (NODE_ENV=${nodeEnv})`, async () => {
          process.env.STAGE = stage;
          const stdoutSpy = jest
            .spyOn(process.stdout, "write")
            .mockReturnValue(true as never);

          const { logger } = await loadLoggerModule();

          logger.error("stage test");

          const output = stdoutSpy.mock.calls
            .map(([chunk]) => String(chunk))
            .join("\n");

          if (nodeEnv === "development") {
            // development uses pino-pretty transport; stage is not emitted in JSON.
            expect(output).not.toContain('"stage":"');
          } else {
            expect(output).toContain(`"stage":"${stage}"`);
          }
        });
      });

      // LOG_LEVEL permutations as individual 'it' blocks
      PINO_LEVELS.forEach((level) => {
        it(`uses LOG_LEVEL='${level}' override (NODE_ENV=${nodeEnv})`, async () => {
          process.env.LOG_LEVEL = level;
          const { logger } = await loadLoggerModule();
          expect(logger.level).toBe(level);
        });
      });

      it("falls back to env default when LOG_LEVEL is invalid", async () => {
        process.env.LOG_LEVEL = "invalid-level";

        const stderrSpy = jest
          .spyOn(process.stderr, "write")
          .mockReturnValue(true as never);

        const { logger } = await loadLoggerModule();

        expect(logger.level).toBe(defaultLevel);
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid LOG_LEVEL="invalid-level"'),
        );
      });
    });

    it("falls back NODE_ENV to development when missing/invalid", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "not-a-real-env";
      const { logger } = await loadLoggerModule();
      expect(logger.level).toBe("debug");
    });

    it("falls back STAGE to prod when missing in non-pretty env", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.STAGE;

      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockReturnValue(true as never);

      const { logger } = await loadLoggerModule();

      logger.info("fallback stage");

      const output = stdoutSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join("\n");
      expect(output).toContain('"stage":"prod"');
    });

    it("redacts token/password/certPassphrase and authorization values", async () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_LEVEL = "info";

      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockReturnValue(true as never);

      const { logger } = await loadLoggerModule();

      logger.info({
        authorization: "Bearer super-secret-auth",
        credentials: {
          token: "tok_abc_123",
          password: "password-123",
        },
        cert: {
          certPassphrase: "cert-passphrase-123",
        },
      });

      const output = stdoutSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join("\n");

      expect(output).toContain("[Redacted]");
      expect(output).not.toContain("super-secret-auth");
      expect(output).not.toContain("tok_abc_123");
      expect(output).not.toContain("password-123");
      expect(output).not.toContain("cert-passphrase-123");

      stdoutSpy.mockRestore();
    });
  });

  describe("createRequestLogger", () => {
    it("creates a request child logger with bound context", async () => {
      process.env.NODE_ENV = "production";
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
});
