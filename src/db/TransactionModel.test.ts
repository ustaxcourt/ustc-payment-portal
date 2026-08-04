import { getKnex } from "./knex";
import TransactionModel, { type PaymentMethod } from "./TransactionModel";

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
    // FLAGGED: main's expectation (total: 100) came from a fully hardcoded mock and never
    // reconciled with success+failed+pending (9) -- there was no real data behind "100".
    // Reproducing it faithfully would require injecting a row with an unrecognized
    // paymentStatus that feeds the reduce-based total but not a bucket, which is exactly the
    // branch we just marked `/* istanbul ignore next */` as ambiguous and out of scope. Using
    // reconciling data here instead; flagging in case "100" needs to come from somewhere else.
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
        paymentMethod: "plastic_card" as PaymentMethod,
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

    // FLAGGED: findPendingOrProcessedByReferenceId is one linear query-builder chain --
    // filtering by status/referenceId/excludeToken happens in Postgres, not in JS. Under
    // mocking, whether first() resolves to a row is whatever we tell it to, not something
    // derived from applying the real predicate. Against the old stateful fake, these 5 cases
    // differed by mutating `mockTransaction.transactionStatus`, which the fake's own
    // reimplemented filter actually checked -- so they were "real" branches of the fake, but
    // not of the production code (there is no per-status branch in the real method). Kept at
    // 5 tests per your instruction; each now asserts the specific where/whereIn/whereNot
    // argument relevant to its scenario so it's verifying argument-passing, not just an
    // outcome we told the mock to produce. Note "pending" vs "processed" (the first two
    // below) end up mechanically identical either way -- there's no argument or call
    // difference between them to assert on, since the real method never inspects
    // transactionStatus itself, it only ever passes the constant ["pending","processed"] to
    // whereIn. Worth deciding whether that pair should stay as true duplicates or be
    // rethought.
    it("returns a transaction when status is pending and referenceId matches", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-789", transactionReferenceId: referenceId };
      builder.first.mockResolvedValueOnce(row);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
        "OTHER-TOKEN",
      );

      expect(builder.whereIn).toHaveBeenCalledWith("transactionStatus", [
        "pending",
        "processed",
      ]);
      expect(found).toBeDefined();
      expect(found?.transactionReferenceId).toBe(referenceId);
    });

    it("returns a transaction when status is processed and referenceId matches", async () => {
      const builder = spyOnQuery();
      const row = { agencyTrackingId: "TEST-789", transactionReferenceId: referenceId };
      builder.first.mockResolvedValueOnce(row);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
        "OTHER-TOKEN",
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
        "OTHER-TOKEN",
      );

      expect(builder.where).toHaveBeenCalledWith(
        "transactionReferenceId",
        "DIFFERENT-REF",
      );
      expect(found).toBeUndefined();
    });

    it("returns undefined when the matching transaction is the excluded token", async () => {
      const builder = spyOnQuery();
      builder.first.mockResolvedValueOnce(undefined);

      const found = await TransactionModel.findPendingOrProcessedByReferenceId(
        clientName,
        referenceId,
        paygovToken,
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
        "OTHER-TOKEN",
      );

      expect(builder.whereIn).toHaveBeenCalledWith("transactionStatus", [
        "pending",
        "processed",
      ]);
      expect(found).toBeUndefined();
    });
  });
});
