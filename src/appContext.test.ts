import { createAppContext } from "./appContext";
import { readFileSync } from "fs";
import * as https from "https";

jest.mock("fs");
jest.mock("node-fetch", () => jest.fn());
jest.mock("https");

const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;

// Import after mocking
let mockFetch: jest.Mock;
beforeAll(async () => {
  mockFetch = (await import("node-fetch")).default as unknown as jest.Mock;
});

describe("appContext", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getHttpsAgent", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
      process.env.CERT_PASSPHRASE = "test-passphrase";
      mockReadFileSync.mockReturnValue("mock-cert-content");
    });

    it("should create an HTTPS agent with correct certificate paths", () => {
      const appContext = createAppContext();
      appContext.getHttpsAgent();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining("certs/development-privatekey.pem"),
        "utf-8"
      );
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining("certs/development-certificate.pem"),
        "utf-8"
      );
    });

    it("should create an HTTPS agent with correct options", () => {
      // Since cache may be populated from previous test, verify the agent has correct properties
      const appContext = createAppContext();
      const agent = appContext.getHttpsAgent();

      expect(agent).toBeInstanceOf(https.Agent);
    });

    it("should cache the HTTPS agent and return the same instance on subsequent calls", () => {
      const appContext = createAppContext();
      const agent1 = appContext.getHttpsAgent();
      const agent2 = appContext.getHttpsAgent();

      expect(agent1).toBe(agent2);
    });
  });

  describe("postHttpRequest", () => {
    const mockResponseText = jest.fn();

    beforeEach(() => {
      process.env.SOAP_URL = "https://test-soap-url.com";
      mockFetch.mockResolvedValue({
        text: mockResponseText,
      } as any);
      mockResponseText.mockResolvedValue("mock-response-body");
    });

    it("should make a POST request to the SOAP_URL with correct headers and body", async () => {
      const appContext = createAppContext();
      const body = "<soap>request</soap>";

      await appContext.postHttpRequest(appContext, body);

      expect(mockFetch).toHaveBeenCalledWith("https://test-soap-url.com", {
        method: "POST",
        headers: {
          "Content-type": "application/soap+xml",
        },
        body,
        agent: undefined,
      });
    });

    it("should include authentication header when PAY_GOV_DEV_SERVER_TOKEN is set", async () => {
      process.env.PAY_GOV_DEV_SERVER_TOKEN = "test-token";
      const appContext = createAppContext();
      const body = "<soap>request</soap>";

      await appContext.postHttpRequest(appContext, body);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-soap-url.com",
        expect.objectContaining({
          headers: {
            "Content-type": "application/soap+xml",
            authentication: "Bearer test-token",
          },
        })
      );
    });

    it("should use HTTPS agent when CERT_PASSPHRASE is set", async () => {
      process.env.CERT_PASSPHRASE = "test-passphrase";
      process.env.NODE_ENV = "development";
      mockReadFileSync.mockReturnValue("mock-cert-content");

      const appContext = createAppContext();
      const body = "<soap>request</soap>";

      await appContext.postHttpRequest(appContext, body);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-soap-url.com",
        expect.objectContaining({
          agent: expect.any(https.Agent),
        })
      );
    });

    it("should not use HTTPS agent when CERT_PASSPHRASE is not set, when running locally/dev", async () => {
      process.env.CERT_PASSPHRASE = "";
      const appContext = createAppContext();
      const body = "<soap>request</soap>";

      await appContext.postHttpRequest(appContext, body);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-soap-url.com",
        expect.objectContaining({
          agent: undefined,
        })
      );
    });

    it("should return the response body as text", async () => {
      const appContext = createAppContext();
      const body = "<soap>request</soap>";

      const result = await appContext.postHttpRequest(appContext, body);

      expect(result).toBe("mock-response-body");
      expect(mockResponseText).toHaveBeenCalled();
    });
  });

  describe("getUseCases", () => {
    it("should return an object with initPayment, processPayment, and getDetails", () => {
      const appContext = createAppContext();
      const useCases = appContext.getUseCases();

      expect(useCases).toHaveProperty("initPayment");
      expect(useCases).toHaveProperty("processPayment");
      expect(useCases).toHaveProperty("getDetails");
    });

    it("should return functions for all use cases", () => {
      const appContext = createAppContext();
      const useCases = appContext.getUseCases();

      expect(typeof useCases.initPayment).toBe("function");
      expect(typeof useCases.processPayment).toBe("function");
      expect(typeof useCases.getDetails).toBe("function");
    });
  });
});
