import { handler } from "./testCert";
import fetch from "node-fetch";
import { getSecretString } from "./clients/secretsClient";

// Mock node-fetch
jest.mock("node-fetch", () => jest.fn());
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock the appContext module
jest.mock("./appContext", () => ({
  createAppContext: jest.fn(() => ({
    getHttpsAgent: jest.fn().mockReturnValue({ mockAgent: true }),
  })),
}));

jest.mock("./clients/secretsClient");
const mockGetSecretString = getSecretString as jest.MockedFunction<typeof getSecretString>;

describe("testCert handler", () => {
  let tempEnv: any;

  beforeAll(() => {
    tempEnv = process.env;
    process.env.SOAP_URL = "http://localhost:3366";
  });

  afterAll(() => {
    process.env = tempEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with WSDL content on successful fetch", async () => {
    const mockWsdlContent = "test wsdl content";

    mockFetch.mockResolvedValue({
      text: jest.fn().mockResolvedValue(mockWsdlContent),
    } as any);

    const result = await handler();

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(mockWsdlContent);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3366?wsdl",
      expect.objectContaining({
        agent: { mockAgent: true },
      })
    );
  });

  it("uses the https agent from appContext", async () => {
    const mockWsdlContent = "test wsdl content";

    mockFetch.mockResolvedValue({
      text: jest.fn().mockResolvedValue(mockWsdlContent),
    } as any);

    await handler();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agent: { mockAgent: true },
      })
    );
  });

  it("constructs the correct WSDL URL from SOAP_URL environment variable", async () => {
    mockFetch.mockResolvedValue({
      text: jest.fn().mockResolvedValue("wsdl content"),
    } as any);

    await handler();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3366?wsdl",
      expect.any(Object)
    );
  });

  it("returns 500 with error message when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await handler();

    expect(result.statusCode).toBe(500);
    expect(result.body).toBe("not ok");
  });

  it("returns 500 when text() method fails", async () => {
    mockFetch.mockResolvedValue({
      text: jest.fn().mockRejectedValue(new Error("Failed to read response")),
    } as any);

    const result = await handler();

    expect(result.statusCode).toBe(500);
    expect(result.body).toBe("not ok");
  });

  it("handles connection timeout errors", async () => {
    mockFetch.mockRejectedValue(new Error("Request timeout"));

    const result = await handler();

    expect(result.statusCode).toBe(500);
    expect(result.body).toBe("not ok");
  });

  it("handles SSL certificate errors", async () => {
    mockFetch.mockRejectedValue(
      new Error("unable to verify the first certificate")
    );

    const result = await handler();

    expect(result.statusCode).toBe(500);
    expect(result.body).toBe("not ok");
  });

  it("includes Authorization header when PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID is set and secret is retrieved successfully", async () => {
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
    mockGetSecretString.mockResolvedValueOnce("secret-token-from-aws");

    const mockWsdlContent = "test wsdl content";
    mockFetch.mockResolvedValue({
      text: jest.fn().mockResolvedValue(mockWsdlContent),
    } as any);

    const result = await handler();

    expect(mockGetSecretString).toHaveBeenCalledWith("token-secret-id");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3366?wsdl",
      expect.objectContaining({
        agent: { mockAgent: true },
        headers: {
          Authorization: "Bearer secret-token-from-aws",
          Authentication: "Bearer secret-token-from-aws",
        },
      })
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(mockWsdlContent);

    delete process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;
  });
});
