"use strict";

// ports.js has module-level state (warnedMissingLsof), so each test resets
// modules and re-mocks dependencies to get a clean slate.

describe("ensurePortsAvailable", () => {
	let ensurePortsAvailable;
	let mockSpawnSync;
	let mockLog;
	// Shared readline answer — set per-test before calling ensurePortsAvailable.
	// The mock factory reads this via closure at call time.
	let rlAnswer;
	let originalProcessKill;
	let originalIsTTY;

	// lsof responses
	function freePortResult() {
		return { status: 1, stdout: "", error: null };
	}
	function occupiedPortResult(pids = "1234") {
		return { status: 0, stdout: `${pids}\n`, error: null };
	}
	function describePidResult(cmd = "node") {
		return { stdout: `${cmd}\n`, status: 0, error: null };
	}

	function setup() {
		jest.resetModules();

		mockSpawnSync = jest.fn();
		mockLog = {
			tag: "[test]",
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
		};
		rlAnswer = "n";

		jest.doMock("node:child_process", () => ({ spawnSync: mockSpawnSync }));
		jest.doMock("./log", () => ({ createLogger: () => mockLog }));
		jest.doMock("node:readline/promises", () => ({
			createInterface: () => ({
				// Use mockImplementation so the closure reads rlAnswer at call time.
				question: jest.fn().mockImplementation(() => Promise.resolve(rlAnswer)),
				close: jest.fn(),
			}),
		}));

		({ ensurePortsAvailable } = require("./ports"));
	}

	beforeEach(() => {
		setup();
		originalProcessKill = process.kill;
		process.kill = jest.fn();
		originalIsTTY = process.stdin.isTTY;
		delete process.env.AUTO_KILL_PORTS;
	});

	afterEach(() => {
		process.kill = originalProcessKill;
		Object.defineProperty(process.stdin, "isTTY", {
			value: originalIsTTY,
			configurable: true,
		});
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	it("returns true when all required ports are free", async () => {
		mockSpawnSync.mockReturnValue(freePortResult());

		expect(await ensurePortsAvailable([8080, 3366])).toBe(true);
	});

	it("returns false when a port is in use and stdin is not a TTY", async () => {
		mockSpawnSync
			.mockReturnValueOnce(occupiedPortResult("1234"))
			.mockReturnValue(describePidResult());
		Object.defineProperty(process.stdin, "isTTY", {
			value: false,
			configurable: true,
		});

		expect(await ensurePortsAvailable([8080])).toBe(false);
	});

	it("returns false when AUTO_KILL_PORTS is not set and stdin is not a TTY", async () => {
		mockSpawnSync.mockReturnValue(occupiedPortResult("1234"));
		Object.defineProperty(process.stdin, "isTTY", {
			value: false,
			configurable: true,
		});

		expect(await ensurePortsAvailable([8080])).toBe(false);
	});

	it("sends SIGTERM and returns true with AUTO_KILL_PORTS=true when port frees immediately", async () => {
		process.env.AUTO_KILL_PORTS = "true";
		mockSpawnSync
			.mockReturnValueOnce(occupiedPortResult("1234")) // listUsedPorts (lsof)
			.mockReturnValueOnce(describePidResult()) // formatUsedPorts → describePid (ps)
			.mockReturnValueOnce(freePortResult()); // waitForPortsFree first poll (lsof)

		expect(await ensurePortsAvailable([8080])).toBe(true);
		expect(process.kill).toHaveBeenCalledWith(1234, "SIGTERM");
	});

	it("returns false with AUTO_KILL_PORTS=true when the port is not freed within the timeout", async () => {
		jest.useFakeTimers();
		process.env.AUTO_KILL_PORTS = "true";
		mockSpawnSync.mockReturnValue(occupiedPortResult("1234")); // always occupied

		const resultPromise = ensurePortsAvailable([8080]);
		await jest.advanceTimersByTimeAsync(6000);

		expect(await resultPromise).toBe(false);
	});

	it("deduplicates PIDs across multiple occupied ports before sending SIGTERM", async () => {
		process.env.AUTO_KILL_PORTS = "true";
		// Both ports occupied by the same PID
		mockSpawnSync
			.mockReturnValueOnce(occupiedPortResult("999")) // listUsedPorts: port 8080 (lsof)
			.mockReturnValueOnce(occupiedPortResult("999")) // listUsedPorts: port 3366 (lsof)
			.mockReturnValueOnce(describePidResult("node")) // formatUsedPorts: describePid for port 8080 (ps)
			.mockReturnValueOnce(describePidResult("node")) // formatUsedPorts: describePid for port 3366 (ps)
			.mockReturnValueOnce(freePortResult()) // waitForPortsFree: port 8080 (lsof)
			.mockReturnValueOnce(freePortResult()); // waitForPortsFree: port 3366 (lsof)

		await ensurePortsAvailable([8080, 3366]);

		// process.kill should be called exactly once for the shared PID
		expect(process.kill).toHaveBeenCalledTimes(1);
		expect(process.kill).toHaveBeenCalledWith(999, "SIGTERM");
	});

	it("returns true and skips the port check when lsof is unavailable (ENOENT)", async () => {
		const enoentError = Object.assign(new Error("lsof not found"), {
			code: "ENOENT",
		});
		mockSpawnSync.mockReturnValue({
			error: enoentError,
			status: null,
			stdout: "",
		});

		expect(await ensurePortsAvailable([8080])).toBe(true);
	});

	it("returns true when the user confirms the kill prompt (TTY path)", async () => {
		rlAnswer = "y";
		mockSpawnSync
			.mockReturnValueOnce(occupiedPortResult("5678")) // listUsedPorts
			.mockReturnValueOnce(describePidResult("node")) // describePid
			.mockReturnValueOnce(freePortResult()); // waitForPortsFree
		Object.defineProperty(process.stdin, "isTTY", {
			value: true,
			configurable: true,
		});

		expect(await ensurePortsAvailable([8080])).toBe(true);
		expect(process.kill).toHaveBeenCalledWith(5678, "SIGTERM");
	});

	it("returns false when the user declines the kill prompt (TTY path)", async () => {
		rlAnswer = "n";
		mockSpawnSync
			.mockReturnValueOnce(occupiedPortResult("5678"))
			.mockReturnValue(describePidResult());
		Object.defineProperty(process.stdin, "isTTY", {
			value: true,
			configurable: true,
		});

		expect(await ensurePortsAvailable([8080])).toBe(false);
		expect(process.kill).not.toHaveBeenCalled();
	});
});
