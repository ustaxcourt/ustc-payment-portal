import { getPayGovAuthHeaders } from "./payGovAuthHeaders";
import { getSecretString } from "@clients/secretsClient";
import type { AppContextLogger } from "@appTypes/AppContext";

jest.mock("@clients/secretsClient");

const mockGetSecretString = getSecretString as jest.MockedFunction<
  typeof getSecretString
>;

const logger: AppContextLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

describe("getPayGovAuthHeaders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns no headers when PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID is unset", async () => {
    delete process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;

    const headers = await getPayGovAuthHeaders(logger);

    expect(headers).toEqual({});
    expect(mockGetSecretString).not.toHaveBeenCalled();
  });

  it("uses the raw secret id as the bearer token when running locally", async () => {
    process.env.APP_ENV = "local";
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "local-token-secret-id";

    const headers = await getPayGovAuthHeaders(logger);

    expect(headers).toEqual({
      Authorization: "Bearer local-token-secret-id",
      Authentication: "Bearer local-token-secret-id",
    });
    expect(mockGetSecretString).not.toHaveBeenCalled();
  });

  it("fetches the token from Secrets Manager when deployed", async () => {
    process.env.APP_ENV = "dev";
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
    mockGetSecretString.mockResolvedValueOnce("secret-token-from-aws");

    const headers = await getPayGovAuthHeaders(logger);

    expect(mockGetSecretString).toHaveBeenCalledWith("token-secret-id");
    expect(headers).toEqual({
      Authorization: "Bearer secret-token-from-aws",
      Authentication: "Bearer secret-token-from-aws",
    });
  });

  it("returns no headers and logs a warning when the Secrets Manager fetch fails", async () => {
    process.env.APP_ENV = "dev";
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
    const fetchError = Object.assign(new Error("AccessDenied"), {
      name: "AccessDeniedException",
    });
    mockGetSecretString.mockRejectedValueOnce(fetchError);

    const headers = await getPayGovAuthHeaders(logger);

    expect(headers).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to read token from Secrets Manager",
      {
        secretId: "token-secret-id",
        errorName: "AccessDeniedException",
        errorMessage: "AccessDenied",
      },
    );
  });
});
