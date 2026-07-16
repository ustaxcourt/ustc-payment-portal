// biome-ignore-all lint/suspicious/noExplicitAny: Test Only, low risk.
// There's a planned refactor of this test coming up that may fix it.
jest.mock("./knex", () => ({
	__esModule: true,
	getKnex: jest.fn().mockResolvedValue({}),
}));

import FeesModel from "./FeesModel";

describe("FeesModel.getActiveFeeByKey", () => {
	const where = jest.fn().mockReturnThis();
	const orderBy = jest.fn().mockReturnThis();
	const first = jest.fn();
	const builder = { where, orderBy, first };

	beforeEach(() => {
		jest.spyOn(FeesModel, "query").mockReturnValue(builder as any);
		where.mockClear();
		orderBy.mockClear();
		first.mockClear();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("filters by feeKey", async () => {
		await FeesModel.getActiveFeeByKey("PETITION_FILING_FEE");
		expect(where).toHaveBeenCalledWith("feeKey", "PETITION_FILING_FEE");
	});

	it("excludes future-dated versions with activationDate <= now", async () => {
		const before = new Date().toISOString();
		await FeesModel.getActiveFeeByKey("PETITION_FILING_FEE");
		const after = new Date().toISOString();

		const cutoffCall = where.mock.calls.find(
			([col, op]) => col === "activationDate" && op === "<=",
		);
		expect(cutoffCall).toBeDefined();

		const cutoff = cutoffCall?.[2] as string;
		expect(cutoff >= before && cutoff <= after).toBe(true);
	});

	it("orders by activationDate descending so the newest active version wins", async () => {
		await FeesModel.getActiveFeeByKey("PETITION_FILING_FEE");
		expect(orderBy).toHaveBeenCalledWith("activationDate", "desc");
	});

	it("returns only the first row", async () => {
		await FeesModel.getActiveFeeByKey("PETITION_FILING_FEE");
		expect(first).toHaveBeenCalled();
	});

	it("returns the row produced by the query builder", async () => {
		const row = {
			feeId: "PETITION_FILING_FEE_2",
			feeKey: "PETITION_FILING_FEE",
		};
		first.mockResolvedValueOnce(row);

		const result = await FeesModel.getActiveFeeByKey("PETITION_FILING_FEE");

		expect(result).toBe(row);
	});

	it("returns undefined when no active version exists", async () => {
		first.mockResolvedValueOnce(undefined);

		const result = await FeesModel.getActiveFeeByKey("UNKNOWN_KEY");

		expect(result).toBeUndefined();
	});
});
