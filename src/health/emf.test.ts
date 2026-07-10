import { logger } from "../utils/logger";
import { writeEmf } from "./emf";

describe("writeEmf", () => {
	const originalEnv = process.env;
	let writeSpy: jest.SpyInstance;

	beforeEach(() => {
		process.env = { ...originalEnv, APP_ENV: "test" };
		writeSpy = jest
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
	});

	afterEach(() => {
		writeSpy.mockRestore();
		process.env = originalEnv;
	});

	const lastEmf = () =>
		JSON.parse((writeSpy.mock.calls[0][0] as string).trim());

	it("writes an EMF record with the shared namespace, Environment dimension, metrics, and values", () => {
		writeEmf([{ Name: "ExampleCount", Unit: "Count" }], { ExampleCount: 1 });

		const emf = lastEmf();
		expect(emf.ExampleCount).toBe(1);
		expect(emf.Environment).toBe("test");
		expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe("USTC/PaymentPortal");
		expect(emf._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Environment"]]);
		expect(emf._aws.CloudWatchMetrics[0].Metrics).toEqual([
			{ Name: "ExampleCount", Unit: "Count" },
		]);
	});

	it("merges non-metric properties (e.g. Reason) onto the record", () => {
		writeEmf(
			[{ Name: "ExampleCount", Unit: "Count" }],
			{ ExampleCount: 1 },
			{ Reason: "some_reason" },
		);

		expect(lastEmf().Reason).toBe("some_reason");
	});

	it("never throws when the underlying write fails (best-effort telemetry)", () => {
		writeSpy.mockImplementation(() => {
			throw new Error("EPIPE");
		});
		const logSpy = jest
			.spyOn(logger, "error")
			.mockImplementation((() => undefined) as never);

		expect(() =>
			writeEmf([{ Name: "ExampleCount", Unit: "Count" }], { ExampleCount: 1 }),
		).not.toThrow();
		expect(logSpy).toHaveBeenCalled();

		logSpy.mockRestore();
	});
});
