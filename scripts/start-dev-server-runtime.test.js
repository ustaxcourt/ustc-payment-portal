"use strict";

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

  it("starts source dev server with ts-node/register/transpile-only when source exists", () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-dev-server-runtime");

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        expect.stringContaining("src/devServer.ts"),
      ],
      expect.objectContaining({
        stdio: "inherit",
        env: process.env,
      }),
    );
  });

  it("falls back to dist/devServer.js when source file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    mockSpawn.mockReturnValue(makeChildProcess());

    require("./start-dev-server-runtime");

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("dist/devServer.js")],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("forwards SIGTERM to the child process", () => {
    mockExistsSync.mockReturnValue(true);
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    process.emit("SIGTERM");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("exits with the child exit code on normal exit", () => {
    mockExistsSync.mockReturnValue(true);
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    child.emit("exit", 42, null);

    expect(processExitSpy).toHaveBeenCalledWith(42);
  });

  it("re-raises a signal when child exits from a signal", () => {
    mockExistsSync.mockReturnValue(true);
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child);

    require("./start-dev-server-runtime");
    child.emit("exit", null, "SIGINT");

    expect(processKillSpy).toHaveBeenCalledWith(process.pid, "SIGINT");
  });

  it("logs and exits 1 when child emits an error", () => {
    mockExistsSync.mockReturnValue(true);
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
