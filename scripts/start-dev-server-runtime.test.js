"use strict";

const path = require("node:path");

describe("start-dev-server-runtime", () => {
  let processExitSpy;
  let processKillSpy;
  let consoleErrorSpy;
  let mockExistsSync;
  let mockSpawn;

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
      emit: (event, ...args) => {
        if (handlers[event]) {
          handlers[event](...args);
        }
      },
    };
  }

  beforeEach(() => {
    jest.resetModules();

    delete process.env.PAYMENT_PORTAL_USE_SOURCE_DEV_SERVER;

    processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    processKillSpy = jest.spyOn(process, "kill").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    mockExistsSync = jest.fn();
    mockSpawn = jest.fn();

    jest.doMock("node:fs", () => ({ existsSync: mockExistsSync }));
    jest.doMock("node:child_process", () => ({ spawn: mockSpawn }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("starts dist dev server by default when dist and source both exist", () => {
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("dist", "devServer.js")) ||
      entry.includes(path.join("src", "devServer.ts")),
    );
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-dev-server-runtime");

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining(path.join("dist", "devServer.js"))],
      expect.objectContaining({
        stdio: "inherit",
        env: process.env,
      }),
    );
  });

  it("uses source dev server when PAYMENT_PORTAL_USE_SOURCE_DEV_SERVER is enabled", () => {
    process.env.PAYMENT_PORTAL_USE_SOURCE_DEV_SERVER = "true";
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("dist", "devServer.js")) ||
      entry.includes(path.join("src", "devServer.ts")),
    );
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-dev-server-runtime");

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        expect.stringContaining(path.join("src", "devServer.ts")),
      ],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("falls back to source when dist file does not exist", () => {
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("src", "devServer.ts")),
    );
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-dev-server-runtime");

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        expect.stringContaining(path.join("src", "devServer.ts")),
      ],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("forwards SIGTERM to the child process", () => {
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("dist", "devServer.js")) ||
      entry.includes(path.join("src", "devServer.ts")),
    );
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    process.emit("SIGTERM");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("exits with the child exit code on normal exit", () => {
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("dist", "devServer.js")) ||
      entry.includes(path.join("src", "devServer.ts")),
    );
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    child.emit("exit", 42, null);

    expect(processExitSpy).toHaveBeenCalledWith(42);
  });

  it("re-raises a signal when child exits from a signal", () => {
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("dist", "devServer.js")) ||
      entry.includes(path.join("src", "devServer.ts")),
    );
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    child.emit("exit", null, "SIGINT");

    expect(processKillSpy).toHaveBeenCalledWith(process.pid, "SIGINT");
  });

  it("logs and exits 1 when child emits an error", () => {
    mockExistsSync.mockImplementation((entry) =>
      entry.includes(path.join("dist", "devServer.js")) ||
      entry.includes(path.join("src", "devServer.ts")),
    );
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    child.emit("error", new Error("spawn failed"));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[start:dev-server] Failed to start dev server",
      expect.any(Error),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
