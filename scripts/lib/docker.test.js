

// docker.js holds module-level state (dockerStarted, dockerLogsProcess), so each
// test resets modules and re-mocks dependencies to get a clean slate.

describe("docker", () => {
  let startDockerStack;
  let stopDockerStack;
  let mockSpawn;
  let mockSpawnSync;
  let mockLog;

  function makeChildProcess() {
    return { killed: false, kill: jest.fn(), on: jest.fn() };
  }

  beforeEach(() => {
    jest.resetModules();

    mockSpawn = jest.fn();
    mockSpawnSync = jest.fn();
    mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    jest.doMock("node:child_process", () => ({
      spawn: mockSpawn,
      spawnSync: mockSpawnSync,
    }));
    jest.doMock("./log", () => ({
      createLogger: () => mockLog,
    }));

    ({ startDockerStack, stopDockerStack } = require("./docker"));
  });

  afterEach(() => jest.restoreAllMocks());

  describe("startDockerStack", () => {
    it("calls spawnSync with docker compose up --wait", () => {
      mockSpawnSync.mockReturnValue({ status: 0, error: null });
      mockSpawn.mockReturnValue(makeChildProcess());

      startDockerStack();

      expect(mockSpawnSync).toHaveBeenCalledWith(
        "docker",
        ["compose", "up", "-d", "--wait"],
        expect.objectContaining({ stdio: "inherit" }),
      );
    });

    it("starts a docker compose logs stream after successful startup", () => {
      mockSpawnSync.mockReturnValue({ status: 0, error: null });
      const logsProc = makeChildProcess();
      mockSpawn.mockReturnValue(logsProc);

      startDockerStack();

      expect(mockSpawn).toHaveBeenCalledWith(
        "docker",
        expect.arrayContaining(["compose", "logs", "-f"]),
        expect.any(Object),
      );
    });

    it("throws when spawnSync returns an error object", () => {
      mockSpawnSync.mockReturnValue({
        error: new Error("docker not found"),
        status: null,
      });

      expect(() => startDockerStack()).toThrow("Failed to start docker compose");
    });

    it("throws when docker compose exits with a non-zero status", () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 1, error: null }) // compose up
        .mockReturnValueOnce({ status: 0, error: null }); // compose logs --tail dump

      expect(() => startDockerStack()).toThrow(
        "docker compose exited with code 1",
      );
    });

    it("dumps recent logs before throwing on non-zero exit", () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 2, error: null })
        .mockReturnValueOnce({ status: 0, error: null });

      expect(() => startDockerStack()).toThrow();
      expect(mockSpawnSync).toHaveBeenCalledWith(
        "docker",
        ["compose", "logs", "--tail", "200"],
        expect.any(Object),
      );
    });
  });

  describe("stopDockerStack", () => {
    it("is a no-op when docker was never started", () => {
      stopDockerStack();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it("kills the log stream and calls docker compose stop after a successful start", () => {
      const logsProc = makeChildProcess();
      mockSpawnSync
        .mockReturnValueOnce({ status: 0, error: null }) // compose up
        .mockReturnValueOnce({ status: 0, error: null }); // compose stop
      mockSpawn.mockReturnValue(logsProc);

      startDockerStack();
      stopDockerStack();

      expect(logsProc.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockSpawnSync).toHaveBeenLastCalledWith(
        "docker",
        ["compose", "stop"],
        expect.objectContaining({ stdio: "inherit" }),
      );
    });

    it("is a no-op on subsequent calls after the first stop", () => {
      const logsProc = makeChildProcess();
      mockSpawnSync
        .mockReturnValueOnce({ status: 0, error: null }) // compose up
        .mockReturnValue({ status: 0, error: null }); // compose stop (once)
      mockSpawn.mockReturnValue(logsProc);

      startDockerStack();
      stopDockerStack();
      stopDockerStack(); // second call — should be a no-op

      // compose up + one compose stop
      expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    });
  });
});
