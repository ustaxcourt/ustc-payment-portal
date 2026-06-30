"use strict";

// start-pay-gov-test-server.js runs top-level code (including resolveTestServerEntry
// via require.resolve) synchronously on require. Tests set required env vars and
// mock child_process.spawn before each require so no real process is started.
//
// Note: resolveTestServerEntry() calls require.resolve('@ustaxcourt/ustc-pay-gov-test-server/dist/server.js').
// This resolves against the actual installed devDependency on disk, so the package
// must be installed (npm ci / npm install) for these tests to pass.

describe("start-pay-gov-test-server", () => {
  let mockSpawn;
  let mockLog;

  function makeChildProcess() {
    const handlers = {};
    return {
      killed: false,
      kill: jest.fn(function () {
        this.killed = true;
      }),
      on: jest.fn((event, cb) => {
        handlers[event] = cb;
      }),
      emit: (event, ...args) => handlers[event] && handlers[event](...args),
    };
  }

  beforeEach(() => {
    jest.resetModules();

    mockSpawn = jest.fn();
    mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    jest.doMock("node:child_process", () => ({ spawn: mockSpawn }));
    jest.doMock("./lib/log", () => ({ createLogger: () => mockLog }));
    jest.doMock("./lib/parsePort", () => ({
      parsePort: jest.fn((value, fallback) => fallback),
    }));

  });

  afterEach(() => {
    delete process.env.PAY_GOV_TEST_SERVER_PORT;
    delete process.env.PAY_GOV_TEST_SERVER_ACCESS_TOKEN;
    delete process.env.PAY_GOV_NODE_ENV;
    jest.restoreAllMocks();
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("spawns the server using process.execPath with the resolved entry point", () => {
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-pay-gov-test-server");

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("server.js")],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          ACCESS_TOKEN: "development-token",
        }),
      }),
    );
  });

  it("sets PORT in the child environment from the resolved port", () => {
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-pay-gov-test-server");

    const spawnEnv = mockSpawn.mock.calls[0][2].env;
    expect(spawnEnv).toHaveProperty("PORT");
    expect(typeof spawnEnv.PORT).toBe("string");
  });

  it("sets NODE_ENV to 'local' by default in the child environment", () => {
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-pay-gov-test-server");

    const spawnEnv = mockSpawn.mock.calls[0][2].env;
    expect(spawnEnv.NODE_ENV).toBe("local");
  });

  it("uses PAY_GOV_TEST_SERVER_ACCESS_TOKEN for ACCESS_TOKEN when set", () => {
    process.env.PAY_GOV_TEST_SERVER_ACCESS_TOKEN = "custom-token";
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-pay-gov-test-server");

    const spawnEnv = mockSpawn.mock.calls[0][2].env;
    expect(spawnEnv.ACCESS_TOKEN).toBe("custom-token");
  });

  it("forwards PAY_GOV_NODE_ENV to the child as NODE_ENV when set", () => {
    process.env.PAY_GOV_NODE_ENV = "staging";
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-pay-gov-test-server");

    const spawnEnv = mockSpawn.mock.calls[0][2].env;
    expect(spawnEnv.NODE_ENV).toBe("staging");
  });

  it("exits with the child process exit code when the child exits normally", () => {
    const processExitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation(() => {});
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-pay-gov-test-server");
    child.emit("exit", 42, null);

    expect(processExitSpy).toHaveBeenCalledWith(42);
    processExitSpy.mockRestore();
  });

  it("logs and exits with 1 when spawn emits an error", () => {
    const processExitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation(() => {});
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-pay-gov-test-server");
    child.emit("error", new Error("spawn failed"));

    expect(mockLog.error).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
    processExitSpy.mockRestore();
  });
});
