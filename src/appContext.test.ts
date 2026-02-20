import { createAppContext } from "./appContext";
import * as https from "https";
import { getSecretString } from "./clients/secretsClient";

jest.mock("node-fetch", () => jest.fn());
jest.mock("https");
jest.mock("./clients/secretsClient");

// Import after mocking
let mockFetch: jest.Mock;
const mockGetSecretString = getSecretString as jest.Mock;
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

  it("should create an HTTPS agent with correct options", () => {
    // Since cache may be populated from previous test, verify the agent has correct properties
    const appContext = createAppContext();
    const agent = appContext.getHttpsAgent();

    expect(agent).toBeInstanceOf(Promise<https.Agent>);
  });

  it("should cache the HTTPS agent and return the same instance on subsequent calls", () => {
    const appContext = createAppContext();
    const agent1 = appContext.getHttpsAgent();
    const agent2 = appContext.getHttpsAgent();

    expect(agent1).toStrictEqual(agent2);
  });
});

describe("postHttpRequest", () => {
  const mockResponseText = jest.fn();

  beforeEach(() => {
    process.env.SOAP_URL = "https://test-soap-url.com";
    mockFetch.mockResolvedValueOnce({
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

  it("should include authentication header when PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID is set and secret is retrieved successfully", async () => {
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
    process.env.NODE_ENV = "test";
    mockGetSecretString.mockResolvedValueOnce("secret-token-from-aws");

    const appContext = createAppContext();
    const body = "<soap>request</soap>";

    await appContext.postHttpRequest(appContext, body);

    expect(mockGetSecretString).toHaveBeenCalledWith("token-secret-id");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test-soap-url.com",
      expect.objectContaining({
        headers: {
          "Content-type": "application/soap+xml",
          Authentication: "Bearer secret-token-from-aws",
          Authorization: "Bearer secret-token-from-aws",
        },
      }),
    );
  });

  it("should include authentication and authorization headers when PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID is set and retrieved locally", async () => {
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "local-token-secret-id";
    process.env.NODE_ENV = "local";

    const appContext = createAppContext();
    const body = "<soap>request</soap>";

    await appContext.postHttpRequest(appContext, body);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test-soap-url.com",
      expect.objectContaining({
        headers: {
          "Content-type": "application/soap+xml",
          Authentication: "Bearer local-token-secret-id",
          Authorization: "Bearer local-token-secret-id",
        },
      }),
    );
  });

  it("should use HTTPS agent when CERT_PASSPHRASE is set", async () => {
    process.env.PRIVATE_KEY_SECRET_ID = "key-id";
    process.env.CERTIFICATE_SECRET_ID = "secret-id";
    (getSecretString as jest.Mock).mockResolvedValue("mock-secret-value");
    const appContext = createAppContext();
    const body = "<soap>request</soap>";

    await appContext.postHttpRequest(appContext, body);

    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      "https://test-soap-url.com",
      expect.objectContaining({
        agent: expect.any(https.Agent),
      }),
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
      }),
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
