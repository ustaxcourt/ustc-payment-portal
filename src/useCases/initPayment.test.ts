jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    createReceived: jest.fn((data) => Promise.resolve({ ...data, agencyTrackingId: data.agencyTrackingId || "MOCK-TRACKING-ID" })),
    updateToInitiated: jest.fn(() => Promise.resolve()),
    updateToFailed: jest.fn(() => Promise.resolve()),
  },
}));


// Mock FeesModel before importing initPayment
jest.mock("../db/FeesModel", () => ({
  __esModule: true,
  default: {
    getFeeById: jest.fn((feeId) => {
      if (feeId === "PETITION_FILING_FEE") {
        return Promise.resolve({
          feeId: "PETITION_FILING_FEE",
          tcsAppId: "TCS123",
          amount: 20, // Add this line
        });
      }
      return Promise.resolve(undefined);
    }),
  },
}));

import { initPayment } from "./initPayment";
import { testAppContext as appContext } from "../test/testAppContext";

const mockSoapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">rO0ABXdlABZ3ZWJsb2dpYy5hcHAudGNzb25saW5lAAAA1gAAACN3ZWJsb2dpYy53b3JrYXJlYS5TdHJpbmdXb3JrQ29udGV4dAAedjguMi4wLjgwMjAyMjlfMjAyM18wNV8wNF8xMzIyAAA=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:startOnlineCollectionResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <startOnlineCollectionResponse>
        <token>211d8c91c046404fb159b52d042a12ba</token>
      </startOnlineCollectionResponse>
    </ns2:startOnlineCollectionResponse>
  </S:Body>
</S:Envelope>`;

describe("initPayment", () => {
  it("throws an error if we pass in an invalid request", async () => {
    await expect(
      initPayment(appContext, {
        amount: 20,
      } as any),
    ).rejects.toThrow();
  });

  it("throws InvalidRequestError with a clear message when feeId is unrecognized", async () => {
    await expect(
      initPayment(appContext, {
        feeId: "UNKNOWN_FEE",
        urlCancel: "http://example.com",
        urlSuccess: "http://example.com",
        metadata: { key: "value" },
        clientName: "Test Client App",
      }),
    ).rejects.toThrow("Unknown feeId: UNKNOWN_FEE");
  });

  it("does not throw an error if we pass in a valid request and updates transaction status", async () => {
    appContext.postHttpRequest = jest.fn().mockReturnValue(mockSoapResponse);
    const TransactionModel = require("../db/TransactionModel").default;

    const { token, paymentRedirect } = await initPayment(appContext, {
      feeId: "PETITION_FILING_FEE",
      urlCancel: "http://example.com",
      urlSuccess: "http://another-example.com",
      metadata: { key1: "value1", key2: "value2" },
      clientName: "Test Client App",
    });

    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToInitiated).toHaveBeenCalled();
    expect(token).toBeTruthy();
    expect(paymentRedirect).toBeTruthy();
  });

  it("updates transaction to failed if SOAP request fails", async () => {
    appContext.postHttpRequest = jest.fn().mockImplementation(() => { throw new Error("SOAP error"); });
    const TransactionModel = require("../db/TransactionModel").default;

    await expect(
      initPayment(appContext, {
        feeId: "PETITION_FILING_FEE",
        urlCancel: "http://example.com",
        urlSuccess: "http://another-example.com",
        metadata: { key1: "value1", key2: "value2" },
        clientName: "Test Client App",
      })
    ).rejects.toThrow("Failed to initiate payment: SOAP error");
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
  });
});
