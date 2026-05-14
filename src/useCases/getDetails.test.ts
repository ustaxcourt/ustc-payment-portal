import { getDetails } from "./getDetails";
import { testAppContext as appContext } from "../test/testAppContext";
import { ClientPermission } from "../types/ClientPermission";
import { NotFoundError } from "../errors/notFound";
import { PayGovError } from "../errors/payGovError";
import { ServerError } from "../errors/serverError";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByReferenceId: jest.fn(),
    updateAfterPayGovResponse: jest.fn(),
    updateToFailed: jest.fn(),
  },
}));

jest.mock("../db/FeesModel", () => ({
  __esModule: true,
  default: {
    getFeeById: jest.fn(),
  },
}));

const TransactionModelMock = TransactionModel as jest.Mocked<typeof TransactionModel>;
const FeesModelMock = FeesModel as jest.Mocked<typeof FeesModel>;

const mockClient: ClientPermission = {
  clientName: "Test Client",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeIds: ["*"],
};

const mockTransactionReferenceId = "550e8400-e29b-41d4-a716-446655440000";
const mockPayGovTrackingId = "TRK1234567890123456AB"; // 21 chars, matches DB column constraint

const buildRow = (overrides: Partial<TransactionModel> = {}): TransactionModel =>
  ({
    agencyTrackingId: "agency-tracking-1",
    clientName: mockClient.clientName,
    feeId: "PETITION_FILING_FEE",
    transactionReferenceId: mockTransactionReferenceId,
    transactionStatus: "processed",
    paymentStatus: "success",
    paygovTrackingId: mockPayGovTrackingId,
    paymentMethod: "plastic_card",
    transactionAmount: 60,
    createdAt: "2026-01-15T10:30:00.000Z",
    lastUpdatedAt: "2026-01-15T10:35:00.000Z",
    ...overrides,
  }) as unknown as TransactionModel;

const mockPendingSoapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
            <agency_tracking_id>agency-tracking-1</agency_tracking_id>
            <transaction_amount>60.00</transaction_amount>
            <transaction_status>Received</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockSuccessSoapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
            <agency_tracking_id>agency-tracking-1</agency_tracking_id>
            <transaction_amount>60.00</transaction_amount>
            <transaction_status>Success</transaction_status>
            <payment_type>ACH</payment_type>
            <transaction_date>2026-01-15T10:30:00</transaction_date>
            <payment_date>2026-01-16</payment_date>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("getDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TransactionModelMock.findByReferenceId.mockResolvedValue([buildRow()]);
    TransactionModelMock.updateAfterPayGovResponse.mockImplementation(
      async (
        agencyTrackingId,
        paygovTrackingId,
        transactionStatus,
        paymentStatus,
        paymentMethod,
        transactionDate,
        paymentDate,
      ) =>
        buildRow({
          agencyTrackingId,
          paygovTrackingId,
          transactionStatus,
          paymentStatus,
          paymentMethod,
          transactionDate,
          paymentDate,
          lastUpdatedAt: "2026-01-15T11:00:00.000Z",
        }),
    );
    FeesModelMock.getFeeById.mockResolvedValue(
      { feeId: "PETITION_FILING_FEE", tcsAppId: "TCSUSTAXCOURTPETITION" } as unknown as FeesModel,
    );
    TransactionModelMock.updateToFailed.mockResolvedValue(undefined as never);
  });

  it("throws NotFoundError when no transactions exist for the reference id", async () => {
    TransactionModelMock.findByReferenceId.mockResolvedValueOnce([]);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      }),
    ).rejects.toThrow(new NotFoundError("Transaction Reference Id was not found"));
  });

  it("throws ServerError when fee is not found for the transaction (data corruption)", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce(undefined);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      }),
    ).rejects.toThrow(ServerError);
  });

  it("throws ServerError when fee has no tcsAppId", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce(
      { feeId: "PETITION_FILING_FEE", tcsAppId: "" } as unknown as FeesModel,
    );
    TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
      buildRow({
        transactionStatus: "pending",
        paymentStatus: "pending",
        paygovTrackingId: mockPayGovTrackingId,
      }),
    ]);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      }),
    ).rejects.toThrow(ServerError);
  });

  it("passes the fee's tcsAppId to the SOAP request when refreshing a pending attempt", async () => {
    appContext.postHttpRequest = jest.fn().mockResolvedValue(mockPendingSoapResponse);
    TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
      buildRow({
        transactionStatus: "pending",
        paymentStatus: "pending",
        paygovTrackingId: mockPayGovTrackingId,
      }),
    ]);

    await getDetails(appContext, {
      client: mockClient,
      request: { transactionReferenceId: mockTransactionReferenceId },
    });

    expect(appContext.postHttpRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("<tcs_app_id>TCSUSTAXCOURTPETITION</tcs_app_id>"),
    );
  });

  describe("terminal status (no Pay.gov refresh)", () => {
    it("returns paymentStatus 'success' when the only attempt is processed", async () => {
      const postHttpRequestSpy = jest.fn();
      appContext.postHttpRequest = postHttpRequestSpy;

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("success");
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("processed");
      expect(postHttpRequestSpy).not.toHaveBeenCalled();
    });

    it("returns paymentStatus 'failed' when all attempts are failed", async () => {
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({ transactionStatus: "failed", paymentStatus: "failed" }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("failed");
    });
  });

  describe("non-terminal status without paygovTrackingId (no Pay.gov refresh)", () => {
    it("returns the local DB status without calling Pay.gov", async () => {
      const postHttpRequestSpy = jest.fn();
      appContext.postHttpRequest = postHttpRequestSpy;

      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          transactionStatus: "received",
          paymentStatus: "pending",
          paygovTrackingId: null,
        }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("pending");
      expect(result.transactions[0].transactionStatus).toBe("received");
      expect(result.transactions[0].payGovTrackingId).toBeUndefined();
      expect(postHttpRequestSpy).not.toHaveBeenCalled();
    });

    it("logs and defaults to 'received' when a row has a null transactionStatus (corrupt data)", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          agencyTrackingId: "corrupt-row",
          transactionStatus: null,
          paymentStatus: "pending",
          paygovTrackingId: null,
        }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.transactions[0].transactionStatus).toBe("received");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Transaction Attempt corrupt-row has null transactionStatus"),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("non-terminal status with paygovTrackingId (refreshes from Pay.gov)", () => {
    beforeEach(() => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockPendingSoapResponse);
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          transactionStatus: "pending",
          paymentStatus: "pending",
          paygovTrackingId: mockPayGovTrackingId,
        }),
      ]);
    });

    it("calls Pay.gov for the latest status", async () => {
      await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(appContext.postHttpRequest).toHaveBeenCalled();
    });

    it("returns the refreshed transaction status from Pay.gov", async () => {
      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      // parseTransactionStatus maps Pay.gov "Received" → internal "pending"
      expect(result.transactions[0].transactionStatus).toBe("pending");
    });

    it("marks the row as failed and throws PayGovError(500) when Pay.gov SOAP refresh fails", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
      appContext.postHttpRequest = jest.fn().mockRejectedValue(new Error("Pay.gov network failure"));

      await expect(
        getDetails(appContext, {
          client: mockClient,
          request: { transactionReferenceId: mockTransactionReferenceId },
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "There was an error communicating with Pay.gov. Please retry your transaction.",
      });

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-1",
        undefined,
        "Pay.gov refresh failed",
      );
      expect(TransactionModelMock.updateAfterPayGovResponse).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to refresh status for paygovTrackingId '${mockPayGovTrackingId}'`),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("throws PayGovError(500) when the Pay.gov response fails schema validation (ZodError)", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
      const malformed = mockPendingSoapResponse.replace(
        `<transaction_status>Received</transaction_status>`,
        `<transaction_status>NonsenseStatus</transaction_status>`,
      );
      appContext.postHttpRequest = jest.fn().mockResolvedValue(malformed);

      const promise = getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      await expect(promise).rejects.toBeInstanceOf(PayGovError);
      await expect(promise).rejects.toMatchObject({ statusCode: 500 });
      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-1",
        undefined,
        "Pay.gov refresh failed",
      );

      consoleErrorSpy.mockRestore();
    });

    it("still throws PayGovError when updateToFailed itself rejects after a SOAP failure", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
      appContext.postHttpRequest = jest.fn().mockRejectedValue(new Error("SOAP boom"));
      TransactionModelMock.updateToFailed.mockRejectedValueOnce(new Error("DB also down"));

      await expect(
        getDetails(appContext, {
          client: mockClient,
          request: { transactionReferenceId: mockTransactionReferenceId },
        }),
      ).rejects.toBeInstanceOf(PayGovError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to mark transaction as failed",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("persists the refreshed status to the database via updateAfterPayGovResponse", async () => {
      await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledTimes(1);
      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledWith(
        "agency-tracking-1",
        mockPayGovTrackingId,
        "pending",
        "pending",
        "plastic_card",
        undefined,
        undefined,
      );
    });

    it("persists payment_type and dates when Pay.gov returns them", async () => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);

      await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledWith(
        "agency-tracking-1",
        mockPayGovTrackingId,
        "processed",
        "success",
        "ach",
        "2026-01-15T10:30:00",
        "2026-01-16",
      );
    });

    it("returns the persisted row's values, not the stale in-memory row", async () => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("success");
      expect(result.transactions[0].transactionStatus).toBe("processed");
      expect(result.transactions[0].updatedTimestamp).toBe("2026-01-15T11:00:00.000Z");
    });

    it("writes paymentMethod=null when neither Pay.gov nor the row has a recognized value", async () => {
      TransactionModelMock.findByReferenceId.mockReset();
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          transactionStatus: "pending",
          paymentStatus: "pending",
          paygovTrackingId: mockPayGovTrackingId,
          paymentMethod: null,
        }),
      ]);

      await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledWith(
        "agency-tracking-1",
        mockPayGovTrackingId,
        "pending",
        "pending",
        null,
        undefined,
        undefined,
      );
    });

    it("preserves the row's existing paymentMethod when Pay.gov returns an unrecognized payment_type", async () => {
      const unknownPaymentTypeResponse = mockSuccessSoapResponse.replace(
        "<payment_type>ACH</payment_type>",
        "<payment_type>GIFT_CARD</payment_type>",
      );
      appContext.postHttpRequest = jest.fn().mockResolvedValue(unknownPaymentTypeResponse);

      await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledWith(
        "agency-tracking-1",
        mockPayGovTrackingId,
        "processed",
        "success",
        "plastic_card",
        "2026-01-15T10:30:00",
        "2026-01-16",
      );
    });

    it("re-derives the group paymentStatus from refreshed rows after a Pay.gov upgrade", async () => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("success");
      expect(result.transactions[0].transactionStatus).toBe("processed");
    });

    it("marks the row as failed and throws PayGovError(500) when updateAfterPayGovResponse rejects", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);
      TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(
        new Error("DB connection lost"),
      );

      await expect(
        getDetails(appContext, {
          client: mockClient,
          request: { transactionReferenceId: mockTransactionReferenceId },
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "There was an error communicating with Pay.gov. Please retry your transaction.",
      });

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-1",
        undefined,
        "Failed to persist Pay.gov refresh",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to persist refreshed status for paygovTrackingId '${mockPayGovTrackingId}'`),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("still throws PayGovError when updateToFailed itself rejects after a persist failure", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);
      TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(new Error("DB down"));
      TransactionModelMock.updateToFailed.mockRejectedValueOnce(new Error("DB even more down"));

      await expect(
        getDetails(appContext, {
          client: mockClient,
          request: { transactionReferenceId: mockTransactionReferenceId },
        }),
      ).rejects.toBeInstanceOf(PayGovError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to mark transaction as failed",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("multiple attempts under the same transactionReferenceId", () => {
    it("derives paymentStatus 'success' when any attempt is processed", async () => {
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          agencyTrackingId: "attempt-1",
          transactionStatus: "failed",
          paymentStatus: "failed",
        }),
        buildRow({
          agencyTrackingId: "attempt-2",
          transactionStatus: "processed",
          paymentStatus: "success",
        }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("success");
      expect(result.transactions).toHaveLength(2);
    });

    it("returns all rows for a transactionReferenceId without filtering by clientName", async () => {
      // getDetails does not authorize by clientName — UUIDv4 makes cross-client collision
      // functionally impossible (~1 in 5×10³⁶), so every row for a transactionReferenceId
      // is returned as-is. If a future requirement (e.g., multiple clients sharing a Fee)
      // makes per-row ownership matter, this test should fail and force a deliberate update.
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({ agencyTrackingId: "ours-1", clientName: mockClient.clientName }),
        buildRow({ agencyTrackingId: "theirs", clientName: "Some Other Client" }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.transactions).toHaveLength(2);
    });

    it("throws ServerError when more than one pending row exists for the same transactionReferenceId", async () => {
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          agencyTrackingId: "attempt-1",
          transactionStatus: "pending",
          paymentStatus: "pending",
          paygovTrackingId: "TRK0000000000000001AB",
        }),
        buildRow({
          agencyTrackingId: "attempt-2",
          transactionStatus: "pending",
          paymentStatus: "pending",
          paygovTrackingId: "TRK0000000000000002AB",
        }),
      ]);

      await expect(
        getDetails(appContext, {
          client: mockClient,
          request: { transactionReferenceId: mockTransactionReferenceId },
        }),
      ).rejects.toThrow(ServerError);
    });

    it("returns 500 even when one row persisted successfully before a sibling row failed", async () => {
      // Sibling rows: row A refreshes cleanly, row B's SOAP call rejects.
      // Promise.all rejects once B throws; A may have already written. The 500 wins —
      // we do not return a 200 with mixed results.
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());

      // Only one row is "pending" — the use case rejects >1 pending row up-front.
      // Row B is "received" (also non-terminal) so both get refreshed in the loop.
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          agencyTrackingId: "row-A",
          paygovTrackingId: "TRK0000000000000001AB",
          transactionStatus: "pending",
          paymentStatus: "pending",
        }),
        buildRow({
          agencyTrackingId: "row-B",
          paygovTrackingId: "TRK0000000000000002AB",
          transactionStatus: "received",
          paymentStatus: "pending",
        }),
      ]);

      appContext.postHttpRequest = jest
        .fn()
        .mockResolvedValueOnce(mockSuccessSoapResponse)
        .mockRejectedValueOnce(new Error("Pay.gov down for row B"));

      await expect(
        getDetails(appContext, {
          client: mockClient,
          request: { transactionReferenceId: mockTransactionReferenceId },
        }),
      ).rejects.toMatchObject({ statusCode: 500 });

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "row-B",
        undefined,
        "Pay.gov refresh failed",
      );

      consoleErrorSpy.mockRestore();
    });

    it("writes back every pending attempt in a multi-row group", async () => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockPendingSoapResponse);
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          agencyTrackingId: "attempt-1",
          paygovTrackingId: "TRK0000000000000001AB",
          transactionStatus: "pending",
          paymentStatus: "pending",
        }),
        buildRow({
          agencyTrackingId: "attempt-2",
          paygovTrackingId: "TRK0000000000000002AB",
          transactionStatus: "received",
          paymentStatus: "pending",
        }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledTimes(2);
      const agencyIdsWritten = TransactionModelMock.updateAfterPayGovResponse.mock.calls
        .map((call) => call[0])
        .sort();
      expect(agencyIdsWritten).toEqual(["attempt-1", "attempt-2"]);
      expect(result.transactions).toHaveLength(2);
    });
  });
});
