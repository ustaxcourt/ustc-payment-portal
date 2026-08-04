import { ConflictError } from "@errors/conflict";
import { getKnex } from "./knex";
import TransactionModel, {
  isStaleProcessingTransaction,
  type PaymentMethod,
  PROCESSING_STALE_MS,
} from "./TransactionModel";

jest.mock("./knex", () => ({
  getKnex: jest.fn(),
}));

const getKnexMock = getKnex as jest.MockedFunction<typeof getKnex>;

const CHAINABLE_METHODS = [
  "alias",
  "join",
  "select",
  "where",
  "whereIn",
  "whereNot",
  "orderBy",
  "limit",
  "count",
  "groupBy",
  "patch",
  "returning",
] as const;

const RESOLVING_METHODS = [
  "first",
  "findOne",
  "findById",
  "insertAndFetch",
  "patchAndFetchById",
] as const;

interface QueryBuilderStub
  extends Record<
    (typeof CHAINABLE_METHODS)[number] | (typeof RESOLVING_METHODS)[number],
    jest.Mock
  > {
  resolvesTo: unknown;
  then: (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

// Chainable stand-in for Objection's query builder. Chain methods return the
// builder itself; awaiting the builder resolves to `resolvesTo`, matching the
// thenable builder the real static methods return or await.
const createQueryBuilder = (): QueryBuilderStub => {
  const builder = { resolvesTo: undefined } as QueryBuilderStub;
  // biome-ignore lint/suspicious/noThenProperty: stand-in mimics Objection's thenable query builder so `await` resolves it directly
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(builder.resolvesTo).then(onFulfilled, onRejected);
  for (const method of CHAINABLE_METHODS) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  for (const method of RESOLVING_METHODS) {
    builder[method] = jest.fn().mockResolvedValue(undefined);
  }
  return builder;
};

const spyOnQuery = () => {
  const builder = createQueryBuilder();
  jest.spyOn(TransactionModel, "query").mockReturnValue(builder as never);
  return builder;
};

beforeEach(() => {
  getKnexMock.mockResolvedValue({} as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("TransactionModel", () => {
  describe("$parseDatabaseJson", () => {
    it("casts transactionAmount from a Postgres decimal string to a number", () => {
      const instance = new TransactionModel();
      const result = instance.$parseDatabaseJson({
        transactionAmount: "60.50",
      });
      expect(typeof result.transactionAmount).toBe("number");
      expect(result.transactionAmount).toBe(60.5);
    });

    it("leaves transactionAmount null when the join produces null", () => {
      const instance = new TransactionModel();
      const result = instance.$parseDatabaseJson({ transactionAmount: null });
      expect(result.transactionAmount).toBeNull();
    });

    it("leaves transactionAmount absent when the column is not in the row", () => {
      const instance = new TransactionModel();
      const result = instance.$parseDatabaseJson({
        agencyTrackingId: "TEST-123",
      });
      expect(result.transactionAmount).toBeUndefined();
    });
  });

  describe("getByPaymentStatus", () => {
    it("queries by paymentStatus, orders by createdAt desc, limits to 100, and attaches feeName", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [
        {
          agencyTrackingId: "TEST-1",
          fee: "PETITION_FILING_FEE",
          createdAt: "2026-04-01T00:00:00Z",
        },
      ];

      const result = await TransactionModel.getByPaymentStatus("pending");

      expect(builder.where).toHaveBeenCalledWith("paymentStatus", "pending");
      expect(builder.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(builder.limit).toHaveBeenCalledWith(100);
      expect(result).toHaveLength(1);
      expect(result[0].feeName).toBe("Petition Filing Fee");
    });
  });

  describe("getAll", () => {
    it("orders by createdAt desc, limits to 100, and attaches feeName to every row", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [
        {
          agencyTrackingId: "TEST-1",
          fee: "PETITION_FILING_FEE",
          createdAt: "2026-04-01T00:00:00Z",
        },
        {
          agencyTrackingId: "TEST-2",
          fee: "PETITION_FILING_FEE",
          createdAt: "2026-04-01T00:00:00Z",
        },
      ];

      const result = await TransactionModel.getAll();

      expect(builder.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(builder.limit).toHaveBeenCalledWith(100);
      expect(result).toHaveLength(2);
      expect(result.every((row) => row.feeName === "Petition Filing Fee")).toBe(
        true,
      );
    });
  });

  describe("getAggregatedPaymentStatus", () => {
    it("groups by paymentStatus and sums counts (including the total)", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [
        { paymentStatus: "success", count: "4" },
        { paymentStatus: "failed", count: "2" },
        { paymentStatus: "pending", count: "3" },
      ];

      const totals = await TransactionModel.getAggregatedPaymentStatus();

      expect(builder.select).toHaveBeenCalledWith("paymentStatus");
      expect(builder.count).toHaveBeenCalledWith("* as count");
      expect(builder.groupBy).toHaveBeenCalledWith("paymentStatus");
      expect(totals).toEqual({
        success: 4,
        failed: 2,
        pending: 3,
        total: 9,
      });
    });

    it("ignores paymentStatus values outside the known set when summing per-status totals", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [{ paymentStatus: "unknown-status", count: "5" }];

      const totals = await TransactionModel.getAggregatedPaymentStatus();

      expect(totals).toEqual({
        success: 0,
        failed: 0,
        pending: 0,
        total: 5,
      });
    });
  });

  describe("createReceived", () => {
    it("inserts with paymentStatus forced to pending and transactionStatus forced to received", async () => {
      const builder = spyOnQuery();
      const data = {
        agencyTrackingId: "TEST-123",
        fee: "PETITION_FILING_FEE",
        clientName: "test-client",
        transactionReferenceId: "TXN-REF-001",
        transactionAmount: 60,
        paymentMethod: "plastic_card" as PaymentMethod,
      };
      const inserted = {
        ...data,
        transactionStatus: "received",
        paymentStatus: "pending",
      };
      builder.insertAndFetch.mockResolvedValueOnce(inserted);

      const result = await TransactionModel.createReceived(data);

      expect(builder.insertAndFetch).toHaveBeenCalledWith({
        ...data,
        paymentStatus: "pending",
        transactionStatus: "received",
      });
      expect(result).toBe(inserted);
    });
  });

  describe("updateToInitiated", () => {
    it("patches transactionStatus to initiated and sets paygovToken for the given agencyTrackingId", async () => {
      const builder = spyOnQuery();

      await TransactionModel.updateToInitiated("TEST-123", "TOKEN123456");

      expect(builder.patch).toHaveBeenCalledWith({
        transactionStatus: "initiated",
        paygovToken: "TOKEN123456",
      });
      expect(builder.where).toHaveBeenCalledWith(
        "agencyTrackingId",
        "TEST-123",
      );
    });
  });

  describe("findByPaygovToken", () => {
    it("returns a TransactionModel when a matching token exists", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-456", paygovToken: "TOKEN-ABC" };
      builder.findOne.mockResolvedValueOnce(row);

      const found = await TransactionModel.findByPaygovToken("TOKEN-ABC");

      expect(builder.findOne).toHaveBeenCalledWith({ paygovToken: "TOKEN-ABC" });
      expect(found).toBe(row);
    });

    it("returns undefined when no matching token exists", async () => {
      const builder = spyOnQuery();
      builder.findOne.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findByPaygovToken(
        "NON-EXISTENT-TOKEN",
      );

      expect(found).toBeUndefined();
    });
  });

  describe("findByPaygovTrackingId", () => {
    it("returns a TransactionModel when a matching paygovTrackingId exists", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-LOOKUP-01", paygovTrackingId: "TRACK-123" };
      builder.findOne.mockResolvedValueOnce(row);

      const found =
        await TransactionModel.findByPaygovTrackingId("TRACK-123");

      expect(builder.findOne).toHaveBeenCalledWith({
        paygovTrackingId: "TRACK-123",
      });
      expect(found).toBe(row);
    });

    it("returns undefined when no matching paygovTrackingId exists", async () => {
      const builder = spyOnQuery();
      builder.findOne.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findByPaygovTrackingId(
        "NON-EXISTENT-TRACKING",
      );

      expect(found).toBeUndefined();
    });
  });

  describe("findByReferenceId", () => {
    it("filters by transactionReferenceId and orders ascending by createdAt", async () => {
      const builder = spyOnQuery();
      const referenceId = "550e8400-e29b-41d4-a716-446655440000";
      const rows = [{ agencyTrackingId: "TEST-REF-1", transactionReferenceId: referenceId }];
      builder.resolvesTo = rows;

      const found = await TransactionModel.findByReferenceId(referenceId);

      expect(builder.where).toHaveBeenCalledWith({
        transactionReferenceId: referenceId,
      });
      expect(builder.orderBy).toHaveBeenCalledWith("createdAt", "asc");
      expect(found).toBe(rows);
    });

    it("returns an empty array when the reference id is not found", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      const found = await TransactionModel.findByReferenceId(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(found).toEqual([]);
    });
  });

  describe("updateAfterPayGovResponse", () => {
    describe("without an expectedTransactionStatus guard", () => {
      it("patches and fetches the row by agencyTrackingId, including optional dates when provided", async () => {
        const builder = spyOnQuery();
        const updated = { agencyTrackingId: "TEST-OK-01", paygovTrackingId: "25PC41EF" };
        builder.patchAndFetchById.mockResolvedValueOnce(updated);

        const result = await TransactionModel.updateAfterPayGovResponse(
          "TEST-OK-01",
          "25PC41EF",
          "processed",
          "success",
          "plastic_card",
          "2016-01-11T16:01:46",
          "2016-01-11",
        );

        expect(builder.patchAndFetchById).toHaveBeenCalledWith("TEST-OK-01", {
          paygovTrackingId: "25PC41EF",
          transactionStatus: "processed",
          paymentStatus: "success",
          paymentMethod: "plastic_card",
          transactionDate: "2016-01-11T16:01:46",
          paymentDate: "2016-01-11",
        });
        expect(result).toBe(updated);
      });

      it("omits transactionDate and paymentDate from the patch when undefined", async () => {
        const builder = spyOnQuery();
        builder.patchAndFetchById.mockResolvedValueOnce({
          agencyTrackingId: "TEST-OK-02",
        });

        await TransactionModel.updateAfterPayGovResponse(
          "TEST-OK-02",
          "TRACK-2",
          "processing",
          "pending",
          null,
          undefined,
          undefined,
        );

        expect(builder.patchAndFetchById).toHaveBeenCalledWith("TEST-OK-02", {
          paygovTrackingId: "TRACK-2",
          transactionStatus: "processing",
          paymentStatus: "pending",
          paymentMethod: null,
        });
      });

      it("throws ConflictError when no row is returned (race with another writer)", async () => {
        const builder = spyOnQuery();
        builder.patchAndFetchById.mockResolvedValueOnce(undefined);

        await expect(
          TransactionModel.updateAfterPayGovResponse(
            "TEST-MISSING",
            "TRACK-3",
            "processed",
            "success",
            "ach",
            undefined,
            undefined,
          ),
        ).rejects.toThrow(new ConflictError(ConflictError.PERSIST_RACE_MESSAGE));
      });
    });

    describe("with an expectedTransactionStatus guard", () => {
      it("patches conditionally on the current transactionStatus and returns the updated row", async () => {
        const builder = spyOnQuery();
        const updated = { agencyTrackingId: "TEST-OK-03" };
        builder.first.mockResolvedValueOnce(updated);

        const result = await TransactionModel.updateAfterPayGovResponse(
          "TEST-OK-03",
          "TRACK-4",
          "processed",
          "success",
          "ach",
          undefined,
          undefined,
          "processing",
        );

        expect(builder.patch).toHaveBeenCalledWith({
          paygovTrackingId: "TRACK-4",
          transactionStatus: "processed",
          paymentStatus: "success",
          paymentMethod: "ach",
        });
        expect(builder.where).toHaveBeenNthCalledWith(
          1,
          "agencyTrackingId",
          "TEST-OK-03",
        );
        expect(builder.where).toHaveBeenNthCalledWith(
          2,
          "transactionStatus",
          "processing",
        );
        expect(builder.returning).toHaveBeenCalledWith("*");
        expect(result).toBe(updated);
      });

      it("throws ConflictError when the guarded transactionStatus no longer matches", async () => {
        const builder = spyOnQuery();
        builder.first.mockResolvedValueOnce(undefined);

        await expect(
          TransactionModel.updateAfterPayGovResponse(
            "TEST-STALE",
            "TRACK-5",
            "processed",
            "success",
            "ach",
            undefined,
            undefined,
            "processing",
          ),
        ).rejects.toThrow(new ConflictError(ConflictError.PERSIST_RACE_MESSAGE));
      });
    });
  });

  describe("findPendingOrProcessedByReferenceId", () => {
    it("filters by pending/processed status, clientName, transactionReferenceId, and excludes the given token", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-789" };
      builder.first.mockResolvedValueOnce(row);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        "test-client",
        "TXN-REF-001",
        "OTHER-TOKEN",
      );

      expect(builder.whereIn).toHaveBeenCalledWith("transactionStatus", [
        "pending",
        "processed",
      ]);
      expect(builder.where).toHaveBeenNthCalledWith(1, "clientName", "test-client");
      expect(builder.where).toHaveBeenNthCalledWith(
        2,
        "transactionReferenceId",
        "TXN-REF-001",
      );
      expect(builder.whereNot).toHaveBeenCalledWith("paygovToken", "OTHER-TOKEN");
      expect(found).toBe(row);
    });

    it("returns undefined when no matching transaction exists", async () => {
      const builder = spyOnQuery();
      builder.first.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        "test-client",
        "DIFFERENT-REF",
        "OTHER-TOKEN",
      );

      expect(found).toBeUndefined();
    });
  });

  describe("findInFlightByReferenceId", () => {
    it("filters by transactionReferenceId and the initiated/processing statuses", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-INFLIGHT" };
      builder.first.mockResolvedValueOnce(row);

      const found =
        await TransactionModel.findInFlightByReferenceId("TXN-REF-001");

      expect(builder.where).toHaveBeenCalledWith(
        "transactionReferenceId",
        "TXN-REF-001",
      );
      expect(builder.whereIn).toHaveBeenCalledWith("transactionStatus", [
        "initiated",
        "processing",
      ]);
      expect(found).toBe(row);
    });

    it("returns undefined when there is no in-flight attempt", async () => {
      const builder = spyOnQuery();
      builder.first.mockResolvedValueOnce(undefined);

      const found =
        await TransactionModel.findInFlightByReferenceId("NO-MATCH");

      expect(found).toBeUndefined();
    });
  });

  describe("updateToFailed", () => {
    it("sets both transactionStatus and paymentStatus to failed and persists returnCode/returnDetail", async () => {
      const builder = spyOnQuery();
      const updated = { agencyTrackingId: "TEST-FAIL-01" };
      builder.patchAndFetchById.mockResolvedValueOnce(updated);

      const result = await TransactionModel.updateToFailed(
        "TEST-FAIL-01",
        3001,
        "Card declined",
      );

      expect(builder.patchAndFetchById).toHaveBeenCalledWith("TEST-FAIL-01", {
        transactionStatus: "failed",
        paymentStatus: "failed",
        returnCode: 3001,
        returnDetail: "Card declined",
      });
      expect(result).toBe(updated);
    });

    it("persists undefined returnCode/returnDetail when not provided", async () => {
      const builder = spyOnQuery();
      builder.patchAndFetchById.mockResolvedValueOnce({
        agencyTrackingId: "TEST-123",
      });

      await TransactionModel.updateToFailed("TEST-123");

      expect(builder.patchAndFetchById).toHaveBeenCalledWith("TEST-123", {
        transactionStatus: "failed",
        paymentStatus: "failed",
        returnCode: undefined,
        returnDetail: undefined,
      });
    });
  });

  describe("isStaleProcessingTransaction", () => {
    it("returns false when transactionStatus is not processing, regardless of age", () => {
      expect(
        isStaleProcessingTransaction({
          transactionStatus: "initiated",
          lastUpdatedAt: new Date(
            Date.now() - PROCESSING_STALE_MS - 1_000,
          ).toISOString(),
        }),
      ).toBe(false);
    });

    it("returns false when a processing row is younger than the stale threshold", () => {
      expect(
        isStaleProcessingTransaction({
          transactionStatus: "processing",
          lastUpdatedAt: new Date(
            Date.now() - PROCESSING_STALE_MS + 1_000,
          ).toISOString(),
        }),
      ).toBe(false);
    });

    it("returns true when a processing row is at or older than the stale threshold", () => {
      expect(
        isStaleProcessingTransaction({
          transactionStatus: "processing",
          lastUpdatedAt: new Date(
            Date.now() - PROCESSING_STALE_MS - 1_000,
          ).toISOString(),
        }),
      ).toBe(true);
    });
  });
});
