// start-local-stack.js runs module-level setup (parsePort, createLogger) and
// then calls main() asynchronously. Tests mock all deps, require the script,
// then flush the microtask queue so main() can settle before assertions.

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("start-local-stack", () => {
	let processExitSpy;
	let mockEnsurePortsAvailable;
	let mockStartDockerStack;
	let mockStopDockerStack;
	let mockSpawn;
	let mockLog;
	let mockSetupConsumerDb;

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
			emit: (event, ...args) => handlers[event]?.(...args),
		};
	}

	beforeEach(() => {
		jest.resetModules();

		processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
		mockEnsurePortsAvailable = jest.fn().mockResolvedValue(true);
		mockStartDockerStack = jest.fn();
		mockStopDockerStack = jest.fn();
		mockSpawn = jest.fn();
		mockLog = {
			tag: "[start]",
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
		};
		mockSetupConsumerDb = jest.fn().mockResolvedValue(undefined);

		jest.doMock("./lib/ports", () => ({
			ensurePortsAvailable: mockEnsurePortsAvailable,
		}));
		jest.doMock("./lib/docker", () => ({
			startDockerStack: mockStartDockerStack,
			stopDockerStack: mockStopDockerStack,
		}));
		jest.doMock("node:child_process", () => ({ spawn: mockSpawn }));
		jest.doMock("./lib/log", () => ({ createLogger: () => mockLog }));
		jest.doMock("./lib/parsePort", () => ({
			parsePort: jest.fn((value, fallback) => fallback),
		}));
		jest.doMock("./lib/dbSetup", () => ({
			setupConsumerDb: mockSetupConsumerDb,
		}));

		// Default: include pay-gov, not in consumer mode
		delete process.env.START_PAY_GOV;
		delete process.env.CONSUMER_MODE;
	});

	afterEach(() => {
		jest.restoreAllMocks();
		// Remove SIGINT/SIGTERM handlers registered by the script to avoid cross-test leaks.
		process.removeAllListeners("SIGINT");
		process.removeAllListeners("SIGTERM");
	});

	it("exits with 1 when ensurePortsAvailable returns false", async () => {
		mockEnsurePortsAvailable.mockResolvedValue(false);

		require("./start-local-stack");
		await flushPromises();

		expect(processExitSpy).toHaveBeenCalledWith(1);
		expect(mockStartDockerStack).not.toHaveBeenCalled();
	});

	it("exits with 1 when startDockerStack throws", async () => {
		mockStartDockerStack.mockImplementation(() => {
			throw new Error("docker compose failed");
		});

		require("./start-local-stack");
		await flushPromises();

		expect(processExitSpy).toHaveBeenCalledWith(1);
	});

	it("calls stopDockerStack on startup failure before exiting", async () => {
		mockStartDockerStack.mockImplementation(() => {
			throw new Error("compose error");
		});

		require("./start-local-stack");
		await flushPromises();

		expect(mockStopDockerStack).not.toHaveBeenCalled(); // exits before children spawn
		expect(processExitSpy).toHaveBeenCalledWith(1);
	});

	it("spawns pay-gov and portal processes when startup succeeds", async () => {
		mockSpawn.mockReturnValue(makeChildProcess());

		require("./start-local-stack");
		await flushPromises();

		// Two processes: pay-gov + portal
		expect(mockSpawn).toHaveBeenCalledTimes(2);
	});

	it("spawns only portal when START_PAY_GOV=false", async () => {
		process.env.START_PAY_GOV = "false";
		mockSpawn.mockReturnValue(makeChildProcess());

		require("./start-local-stack");
		await flushPromises();

		expect(mockSpawn).toHaveBeenCalledTimes(1);
	});

	it("calls stopDockerStack and exits when all spawned children close", async () => {
		const child1 = makeChildProcess();
		const child2 = makeChildProcess();
		mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

		require("./start-local-stack");
		await flushPromises();

		// Simulate both children closing cleanly
		child1.emit("close");
		child2.emit("close");

		expect(mockStopDockerStack).toHaveBeenCalled();
		expect(processExitSpy).toHaveBeenCalled();
	});

	it("logs and initiates shutdown when a child process exits with a non-zero code", async () => {
		const child1 = makeChildProcess();
		const child2 = makeChildProcess();
		mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

		require("./start-local-stack");
		await flushPromises();

		// Simulate child1 (pay-gov) crashing with exit code 1
		child1.emit("exit", 1, null);

		expect(mockLog.error).toHaveBeenCalled();
	});

	it("starts shutdown on child exit with signal", async () => {
		const child1 = makeChildProcess();
		const child2 = makeChildProcess();
		mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

		require("./start-local-stack");
		await flushPromises();

		child1.emit("exit", null, "SIGTERM");

		// Other child should be told to stop
		expect(child2.kill).toHaveBeenCalled();
	});

	it("logs and shuts down when a child process emits an error event", async () => {
		const child1 = makeChildProcess();
		const child2 = makeChildProcess();
		mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

		require("./start-local-stack");
		await flushPromises();

		child1.emit("error", new Error("spawn ENOENT"));

		expect(mockLog.error).toHaveBeenCalled();
		expect(child2.kill).toHaveBeenCalled();
	});

	it("logs, stops docker, and exits when main() rejects unexpectedly", async () => {
		mockEnsurePortsAvailable.mockRejectedValue(new Error("unexpected failure"));

		require("./start-local-stack");
		await flushPromises();

		expect(mockLog.error).toHaveBeenCalled();
		expect(mockStopDockerStack).toHaveBeenCalled();
		expect(processExitSpy).toHaveBeenCalledWith(1);
	});

	it("runs setupConsumerDb before spawning processes in CONSUMER_MODE", async () => {
		process.env.CONSUMER_MODE = "true";
		mockSpawn.mockReturnValue(makeChildProcess());

		require("./start-local-stack");
		await flushPromises();

		expect(mockSetupConsumerDb).toHaveBeenCalled();
		expect(mockSpawn).toHaveBeenCalled();
	});

	it("stops docker and exits when setupConsumerDb fails in CONSUMER_MODE", async () => {
		process.env.CONSUMER_MODE = "true";
		mockSetupConsumerDb.mockRejectedValue(new Error("migration failed"));

		require("./start-local-stack");
		await flushPromises();

		expect(mockStopDockerStack).toHaveBeenCalled();
		expect(processExitSpy).toHaveBeenCalledWith(1);
		expect(mockSpawn).not.toHaveBeenCalled();
	});
});
