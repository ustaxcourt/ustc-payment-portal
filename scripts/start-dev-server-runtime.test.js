"use strict";

describe("start-dev-server-runtime", () => {
  let mockExistsSync;
  let mockSpawn;
  let mockWireChild;
  let processExitSpy;
  let consoleErrorSpy;

  function makeChildProcess() {
    const handlers = {};
    return {
      on: jest.fn((event, cb) => {
        handlers[event] = cb;
      }),
      emit: (event, ...args) => handlers[event] && handlers[event](...args),
    };
  }

  beforeEach(() => {
    jest.resetModules();

    mockExistsSync = jest.fn();
    mockSpawn = jest.fn();
    mockWireChild = jest.fn();
    processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    jest.doMock("node:fs", () => ({ existsSync: mockExistsSync }));
    jest.doMock("node:child_process", () => ({ spawn: mockSpawn }));
    jest.doMock("./lib/wireChild", () => ({ wireChild: mockWireChild }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logs a targeted message and exits when tsx cannot be resolved", () => {
    const { resolveTsxCliPath } = require("./start-dev-server-runtime");

    const resolvedPath = resolveTsxCliPath(() => {
      throw new Error("Cannot find module 'tsx/cli'");
    });

    expect(resolvedPath).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unable to resolve tsx/cli"),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("npm install"),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("does not spawn the source runtime when tsx resolution fails in a repo checkout", () => {
    mockExistsSync.mockReturnValue(true);

    const { startDevServerRuntime } = require("./start-dev-server-runtime");

    startDevServerRuntime({ resolveTsxCli: () => null });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockWireChild).not.toHaveBeenCalled();
  });

  it("spawns the source runtime through tsx when available in a repo checkout", () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue(makeChildProcess());

    const { startDevServerRuntime } = require("./start-dev-server-runtime");

    startDevServerRuntime({ resolveTsxCli: () => "/mocked/tsx/cli.js" });

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ["/mocked/tsx/cli.js", expect.stringContaining("src/devServer.ts")],
      expect.objectContaining({
        stdio: "inherit",
        env: process.env,
      }),
    );
    expect(mockWireChild).toHaveBeenCalled();
  });
});
