import { getDetails } from "./getDetails";
import { testAppContext as appContext } from "../test/testAppContext";
import { ClientPermission } from "../types/ClientPermission";
import { NotFoundError } from "../errors/notFound";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByPaygovTrackingId: jest.fn(),
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

const mockPayGovTrackingId = "test-tracking-id-12345";

const mockSuccessResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
            <transaction_status>Success</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockPendingResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
            <transaction_status>Received</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("getDetails", () => {
  beforeEach(() => {
    TransactionModelMock.findByPaygovTrackingId.mockResolvedValue(
      { feeId: "fee-123", paygovTrackingId: mockPayGovTrackingId } as unknown as TransactionModel,
    );
    FeesModelMock.getFeeById.mockResolvedValue(
      { feeId: "fee-123", tcsAppId: "TCSUSTAXCOURTPETITION" } as unknown as FeesModel,
    );
  });

  it("throws NotFoundError when transaction is not found", async () => {
    TransactionModelMock.findByPaygovTrackingId.mockResolvedValueOnce(undefined);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: "unknown-id" },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when fee is not found for the transaction", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce(undefined);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: mockPayGovTrackingId },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when fee has no tcsAppId", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce({ feeId: "fee-123", tcsAppId: "" } as unknown as FeesModel);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: mockPayGovTrackingId },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("passes the fee's tcsAppId to the SOAP request", async () => {
    appContext.postHttpRequest = jest.fn().mockReturnValue(mockSuccessResponse);

    await getDetails(appContext, {
      client: mockClient,
      request: { payGovTrackingId: mockPayGovTrackingId },
    });

    expect(appContext.postHttpRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("<tcs_app_id>TCSUSTAXCOURTPETITION</tcs_app_id>"),
    );
  });

  describe("Successfully retrieved transaction details", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessResponse);
    });

    it("returns the trackingId from the XML", async () => {
      const { trackingId } = await getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: mockPayGovTrackingId },
      });

      expect(trackingId).toEqual(mockPayGovTrackingId);
    });

    it("returns the transactionStatus from the XML", async () => {
      const { transactionStatus } = await getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: mockPayGovTrackingId },
      });

      expect(transactionStatus).toEqual("processed");
    });
  });

  describe("Pending transaction details", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
    });

    it("returns the trackingId", async () => {
      const { trackingId } = await getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: mockPayGovTrackingId },
      });

      expect(trackingId).toBe(mockPayGovTrackingId);
    });

    it("returns Pending transaction status", async () => {
      const { transactionStatus } = await getDetails(appContext, {
        client: mockClient,
        request: { payGovTrackingId: mockPayGovTrackingId },
      });

      expect(transactionStatus).toBe("pending");
    });
  });
});
