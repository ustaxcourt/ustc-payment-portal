import type { DbPaymentMethod } from "@schemas/PaymentMethod.schema";
import { ConflictError } from "@/errors/conflict";
import { getKnex } from "./knex";
import TransactionModel, { isStaleProcessingTransaction } from "./TransactionModel";

jest.mock("./knex", () => ({
  getKnex: jest.fn(),
}));

const getKnexMock = getKnex as jest.MockedFunction<typeof getKnex>;

const CHAINABLE_METHODS = [
  "alias",
  "join",
  "select",
  "where",
  "andWhere",
  "andWhereILike",
  "whereRaw",
  "whereIn",
  "whereNot",
  "orderBy",
  "orderByRaw",
  "limit",
  "offset",
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
  "resultSize",
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
    // Uses the real (unmocked) class to exercise the load-bearing coercion:
    // the pg driver returns transactionAmount as a decimal string, and it must
    // be cast to a number before hitting the response schema's z.number().
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

    it("passes through a known paymentMethod value", () => {
      const instance = new TransactionModel();
      const result = instance.$parseDatabaseJson({ paymentMethod: "ach" });
      expect(result.paymentMethod).toBe("ach");
    });

    it("leaves paymentMethod null when the column is null", () => {
      const instance = new TransactionModel();
      const result = instance.$parseDatabaseJson({ paymentMethod: null });
      expect(result.paymentMethod).toBeNull();
    });

    it("leaves paymentMethod absent when the column is not in the row", () => {
      const instance = new TransactionModel();
      const result = instance.$parseDatabaseJson({
        agencyTrackingId: "TEST-123",
      });
      expect(result.paymentMethod).toBeUndefined();
    });

    // The column is a plain varchar with no DB-level enum/CHECK constraint, so
    // this is the only guard against a legacy row or manual edit silently
    // reaching the API with a value outside the union.
    it("throws when paymentMethod holds a value outside the known union", () => {
      const instance = new TransactionModel();
      expect(() =>
        instance.$parseDatabaseJson({ paymentMethod: "venmo" }),
      ).toThrow("Unknown payment method: venmo");
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

    it("returns an empty array when no transactions match the given paymentStatus", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      const result = await TransactionModel.getByPaymentStatus("failed");

      expect(result).toEqual([]);
    });
  });

  describe("getAll", () => {
    it("resolves without error and returns an array", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      const result = await TransactionModel.getAll();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getAggregatedPaymentStatus", () => {
    it("returns the expected totals object", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [
        { paymentStatus: "success", count: "4" },
        { paymentStatus: "failed", count: "2" },
        { paymentStatus: "pending", count: "3" },
      ];

      const totals = await TransactionModel.getAggregatedPaymentStatus();

      expect(totals).toEqual({
        success: 4,
        failed: 2,
        pending: 3,
        total: 9,
      });
    });
  });

  describe("createReceived", () => {
    it("should create a received transaction", async () => {
      const builder = spyOnQuery();
      const data = {
        agencyTrackingId: "TEST-123",
        fee: "PETITION_FILING_FEE",
        clientName: "test-client",
        transactionReferenceId: "TXN-REF-001",
        transactionAmount: 60,
        paymentMethod: "plastic_card" as DbPaymentMethod,
      };
      builder.insertAndFetch.mockResolvedValueOnce({
        ...data,
        transactionStatus: "received",
        paymentStatus: "pending",
      });

      const transaction = await TransactionModel.createReceived(data);

      expect(transaction).toBeDefined();
      expect(transaction.agencyTrackingId).toBe(data.agencyTrackingId);
      expect(transaction.transactionStatus).toBe("received");
      expect(transaction.paymentStatus).toBe("pending");
    });
  });

  describe("updateToFailed", () => {
    it("should set both transactionStatus and paymentStatus to failed", async () => {
      const builder = spyOnQuery();
      builder.patchAndFetchById.mockResolvedValueOnce({
        agencyTrackingId: "TEST-123",
        transactionStatus: "failed",
        paymentStatus: "failed",
      });

      const updated = await TransactionModel.updateToFailed("TEST-123");

      expect(builder.patchAndFetchById).toHaveBeenCalledWith("TEST-123", {
        transactionStatus: "failed",
        paymentStatus: "failed",
        returnCode: undefined,
        returnDetail: undefined,
      });
      expect(updated?.transactionStatus).toBe("failed");
      expect(updated?.paymentStatus).toBe("failed");
    });

    it("should persist returnCode and returnDetail when provided", async () => {
      const builder = spyOnQuery();
      builder.patchAndFetchById.mockResolvedValueOnce({
        agencyTrackingId: "TEST-FAIL-01",
        returnCode: 3001,
        returnDetail: "Card declined",
      });

      const updated = await TransactionModel.updateToFailed(
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
      expect(updated?.returnCode).toBe(3001);
      expect(updated?.returnDetail).toBe("Card declined");
    });
  });

  describe("updateAfterPayGovResponse", () => {
    it("persists paygovTrackingId, statuses, paymentMethod, and dates", async () => {
      const builder = spyOnQuery();
      builder.patchAndFetchById.mockResolvedValueOnce({
        agencyTrackingId: "TEST-OK-01",
        paygovTrackingId: "25PC41EF",
        transactionStatus: "processed",
        paymentStatus: "success",
        paymentMethod: "plastic_card",
        transactionDate: "2016-01-11T16:01:46",
        paymentDate: "2016-01-11",
      });

      const updated = await TransactionModel.updateAfterPayGovResponse(
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
      expect(updated?.paygovTrackingId).toBe("25PC41EF");
      expect(updated?.transactionStatus).toBe("processed");
      expect(updated?.paymentStatus).toBe("success");
      expect(updated?.paymentMethod).toBe("plastic_card");
      expect(updated?.transactionDate).toBe("2016-01-11T16:01:46");
      expect(updated?.paymentDate).toBe("2016-01-11");
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

    it("patches conditionally on the current transactionStatus and returns the updated row when the guard matches", async () => {
      const builder = spyOnQuery();
      const updatedRow = { agencyTrackingId: "TEST-OK-03" };
      builder.first.mockResolvedValueOnce(updatedRow);

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
      expect(result).toBe(updatedRow);
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

  describe("findByPaygovTrackingId", () => {
    it("returns a TransactionModel when a matching paygovTrackingId exists", async () => {
      const builder = spyOnQuery();
      const row = {
        agencyTrackingId: "TEST-LOOKUP-01",
        paygovTrackingId: "TRACK-123",
      };
      builder.findOne.mockResolvedValueOnce(row);

      const found =
        await TransactionModel.findByPaygovTrackingId("TRACK-123");

      expect(builder.findOne).toHaveBeenCalledWith({
        paygovTrackingId: "TRACK-123",
      });
      expect(found).toBeDefined();
      expect(found?.paygovTrackingId).toBe("TRACK-123");
      expect(found?.agencyTrackingId).toBe("TEST-LOOKUP-01");
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

  describe("updateToInitiated", () => {
    // FLAGGED: main's version referenced `agencyTrackingId`, a variable set as a side effect
    // of the earlier "createReceived" test in a different describe block -- an implicit
    // cross-test ordering dependency that only worked because of file declaration order.
    // There's no shared mock state to preserve here, so this uses a literal id instead.
    // Also, main's test read back `updated?.transactionStatus` via a follow-up
    // `TransactionModel.query().findById(...)` call, but the real `updateToInitiated`
    // returns `Promise<void>` -- that read-back only ever worked because the old mock kept
    // its own shared `mockTransaction` object across calls. There's no equivalent production
    // behavior to assert on, so that part of the test is dropped in favor of asserting the
    // patch/where call directly.
    it("should update transaction to initiated", async () => {
      const builder = spyOnQuery();
      const paygovToken = "TOKEN123456";

      await TransactionModel.updateToInitiated("TEST-123", paygovToken);

      expect(builder.patch).toHaveBeenCalledWith({
        transactionStatus: "initiated",
        paygovToken,
      });
      expect(builder.where).toHaveBeenCalledWith(
        "agencyTrackingId",
        "TEST-123",
      );
    });
  });

  describe("findByPaygovToken", () => {
    it("should return a TransactionModel when a matching token exists", async () => {
      const builder = spyOnQuery();
      const paygovToken = "PAYGOV-TOKEN-123";
      const row = { agencyTrackingId: "TEST-456", paygovToken };
      builder.findOne.mockResolvedValueOnce(row);

      const found = await TransactionModel.findByPaygovToken(paygovToken);

      expect(builder.findOne).toHaveBeenCalledWith({ paygovToken });
      expect(found).toBeDefined();
      expect(found?.paygovToken).toBe(paygovToken);
      expect(found?.agencyTrackingId).toBe("TEST-456");
    });

    it("should return undefined when no matching token exists", async () => {
      const builder = spyOnQuery();
      builder.findOne.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findByPaygovToken(
        "NON-EXISTENT-TOKEN",
      );
      expect(found).toBeUndefined();
    });
  });

  describe("findByReferenceId", () => {
    const referenceId = "550e8400-e29b-41d4-a716-446655440000";

    it("returns the matching transaction(s) when the reference id exists", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [
        { agencyTrackingId: "TEST-REF-1", transactionReferenceId: referenceId },
      ];

      const found = await TransactionModel.findByReferenceId(referenceId);

      expect(builder.where).toHaveBeenCalledWith({
        transactionReferenceId: referenceId,
      });
      expect(found).toHaveLength(1);
      expect(found[0].transactionReferenceId).toBe(referenceId);
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

  describe("findPendingOrProcessedByReferenceId", () => {
    const clientName = "test-client";
    const referenceId = "TXN-REF-001";
    const paygovToken = "TOKEN-PENDING-123";

    it("returns a transaction when status is pending/processed and referenceId matches", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-789", transactionReferenceId: referenceId };
      builder.first.mockResolvedValueOnce(row);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
        { excludeToken: "OTHER-TOKEN" },
      );

      expect(builder.whereIn).toHaveBeenCalledWith("transactionStatus", [
        "pending",
        "processed",
      ]);
      expect(found).toBeDefined();
      expect(found?.transactionReferenceId).toBe(referenceId);
    });

    it("returns undefined when referenceId does not match", async () => {
      const builder = spyOnQuery();
      builder.first.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        "DIFFERENT-REF",
        { excludeToken: "OTHER-TOKEN" },
      );

      expect(builder.where).toHaveBeenCalledWith(
        "transactionReferenceId",
        "DIFFERENT-REF",
      );
      expect(found).toBeUndefined();
    });

    it("skips the token exclusion when no token is given (initPayment has none yet)", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-789", paygovToken };
      builder.first.mockResolvedValueOnce(row);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
      );

      expect(builder.whereNot).not.toHaveBeenCalled();
      expect(found).toBe(row);
    });

    it("returns undefined when the matching transaction is the excluded token", async () => {
      const builder = spyOnQuery();
      builder.first.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
        { excludeToken: paygovToken },
      );

      expect(builder.whereNot).toHaveBeenCalledWith("paygovToken", paygovToken);
      expect(found).toBeUndefined();
    });

    it("returns undefined when transaction status is not pending or processed", async () => {
      const builder = spyOnQuery();
      builder.first.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
        { excludeToken: "OTHER-TOKEN" },
      );

      expect(builder.whereIn).toHaveBeenCalledWith("transactionStatus", [
        "pending",
        "processed",
      ]);
      expect(found).toBeUndefined();
    });
  });

  describe("findInFlightByReferenceId", () => {
    it("filters by clientName, transactionReferenceId and the initiated/processing statuses", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-INFLIGHT" };
      builder.first.mockResolvedValueOnce(row);

      const found = await TransactionModel.findInFlightByReferenceId(
        "test-client",
        "TXN-REF-001",
      );

      expect(builder.where).toHaveBeenCalledWith("clientName", "test-client");
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

      const found = await TransactionModel.findInFlightByReferenceId(
        "test-client",
        "NO-MATCH",
      );

      expect(found).toBeUndefined();
    });
  });

  describe("queryLog", () => {
    const baseFilter = {
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-02T00:00:00Z"),
      sort: "lastUpdatedAt" as const,
      order: "desc" as const,
      limit: 50,
      offset: 0,
    };

    it("filters by timeframe only when no optional filters are given", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog(baseFilter);

      expect(builder.where).toHaveBeenCalledWith(
        "lastUpdatedAt",
        ">=",
        baseFilter.from,
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        "lastUpdatedAt",
        "<",
        baseFilter.to,
      );
      expect(builder.andWhere).not.toHaveBeenCalledWith(
        "paymentStatus",
        expect.anything(),
      );
      expect(builder.andWhereILike).not.toHaveBeenCalled();
    });

    it("filters by status, fee, and payment method when given", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog({
        ...baseFilter,
        status: "failed",
        fee: "PETITION_FILING_FEE",
        paymentMethod: "ach" as DbPaymentMethod,
      });

      expect(builder.andWhere).toHaveBeenCalledWith("paymentStatus", "failed");
      expect(builder.andWhere).toHaveBeenCalledWith(
        "fee",
        "PETITION_FILING_FEE",
      );
      expect(builder.andWhere).toHaveBeenCalledWith("paymentMethod", "ach");
    });

    it("filters by transaction status when given", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog({
        ...baseFilter,
        transactionStatus: "processed",
      });

      expect(builder.andWhere).toHaveBeenCalledWith(
        "transactionStatus",
        "processed",
      );
    });

    it("matches a metadata key with a case-insensitive substring, escaping LIKE wildcards", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog({
        ...baseFilter,
        metadataKey: "docketNumber",
        metadataValue: "50%_x",
      });

      expect(builder.whereRaw).toHaveBeenCalledWith("metadata ->> ? ILIKE ?", [
        "docketNumber",
        "%50\\%\\_x%",
      ]);
    });

    it("omits the metadata predicate when only a key is given", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog({
        ...baseFilter,
        metadataKey: "docketNumber",
      });

      expect(builder.whereRaw).not.toHaveBeenCalled();
    });

    it("skips the total query when withTotal is false", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog({ ...baseFilter, withTotal: false });

      expect(builder.resultSize).not.toHaveBeenCalled();
    });

    it("runs the total query when withTotal is not false", async () => {
      const builder = spyOnQuery();
      builder.resolvesTo = [];

      await TransactionModel.queryLog(baseFilter);

      expect(builder.resultSize).toHaveBeenCalled();
    });
  });

  describe("isStaleProcessingTransaction", () => {
    it("returns true for a transaction with status 'processing' and lastUpdatedAt older than 10 minutes", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000 - 1);
      const transaction = {
        transactionStatus: "processing",
        lastUpdatedAt: tenMinutesAgo.toISOString(),
      } as TransactionModel;
      const result = isStaleProcessingTransaction(transaction);
      expect(result).toBe(true);
    });

    it("returns false for a transaction with status 'processing' and lastUpdatedAt within 10 minutes", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const transaction = {
        transactionStatus: "processing",
        lastUpdatedAt: fiveMinutesAgo.toISOString(),
      } as TransactionModel;
      const result = isStaleProcessingTransaction(transaction);
      expect(result).toBe(false);
    });

    it("returns false for a transaction with status other than 'processing'", () => {
      const transaction = {
        transactionStatus: "pending",
        lastUpdatedAt: new Date().toISOString(),
      } as TransactionModel;
      const result = isStaleProcessingTransaction(transaction);
      expect(result).toBe(false);
    });
  });
});
