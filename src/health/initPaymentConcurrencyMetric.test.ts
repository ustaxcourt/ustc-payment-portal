import { logger } from "../utils/logger";
import {
	emitInitPaymentConflictMetric,
	type InitPaymentConflictReason,
} from "./initPaymentConcurrencyMetric";

describe("emitInitPaymentConflictMetric", () => {
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

	it.each<InitPaymentConflictReason>([
		"processing_in_flight",
		"persist_race",
	])("emits InitPaymentConflict=1 with Reason=%s", (reason) => {
		emitInitPaymentConflictMetric(reason);

		const emf = lastEmf();
		expect(emf.InitPaymentConflict).toBe(1);
		expect(emf.Reason).toBe(reason);
		expect(emf.Environment).toBe("test");
		expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe("USTC/PaymentPortal");
		expect(emf._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Environment"]]);
	});

	it("never throws when stdout write fails", () => {
		writeSpy.mockImplementation(() => {
			throw new Error("EPIPE");
		});
		const logSpy = jest
			.spyOn(logger, "error")
			.mockImplementation((() => undefined) as never);

		expect(() =>
			emitInitPaymentConflictMetric("processing_in_flight"),
		).not.toThrow();
		expect(logSpy).toHaveBeenCalled();

		logSpy.mockRestore();
	});
});
