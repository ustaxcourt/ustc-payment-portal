import { authorizeRequest } from "./authorizeRequest";
import { UnauthorizedError } from "./errors/unauthorized";
import { ServerError } from "./errors/serverError";
import { getSecretString } from "./clients/secretsClient";

jest.mock("./clients/secretsClient");

let tempEnv: any;
const testToken = "one-quarter";
const testSecretId = "test-secret-id";

describe("authorizeRequest", () => {
  const mockRequest = {
    Authentication: `Bearer ${testToken}`,
  };

  beforeAll(() => {
    tempEnv = process.env;
    process.env.API_ACCESS_TOKEN_SECRET_ID = testSecretId;
    (getSecretString as jest.Mock).mockResolvedValue(testToken);
  });

  afterEach(() => {
    process.env.API_ACCESS_TOKEN_SECRET_ID = testSecretId;
  })

  afterAll(() => {
    process.env = tempEnv;
  });

  it("does not throw an error if the request.authToken matches the token from Secrets Manager", async () => {
    let result;
    try {
      await authorizeRequest(mockRequest);
      result = "success";
    } catch (err) {
      // catch any errors,
    }
    expect(result).toEqual("success");
  });

  it("throws an error if the request.authToken does not match the token from Secrets Manager", async () => {
    let result;
    try {
      await authorizeRequest({
        Authentication: "Bearer some-other-token",
      });
      result = "success";
    } catch (err) {
      // catch any errors,
      expect(err).toBeInstanceOf(UnauthorizedError);
    }
    expect(result).toBeUndefined();
  });

  it("throws an error if headers are missing", async () => {
    let result;
    try {
      await authorizeRequest(undefined);
      result = "success";
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).message).toEqual(
        "Missing Authentication",
      );
    }
    expect(result).toBeUndefined();
  });

  it("throws an error if Authentication header is missing from headers object", async () => {
    let result;
    try {
      await authorizeRequest({
        "Content-Type": "application/json",
        "User-Agent": "test",
      });
      result = "success";
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).message).toEqual("Unauthorized");
    }
    expect(result).toBeUndefined();
  });

  it("throws an UnauthorizedError when API_ACCESS_TOKEN_SECRET_ID is not set", async () => {
    delete process.env.API_ACCESS_TOKEN_SECRET_ID;
    jest.resetModules();
    const { authorizeRequest: freshAuthorizeRequest } = require("./authorizeRequest");
    const { UnauthorizedError: FreshUnauthorizedError } = require("./errors/unauthorized");

    let result;
    try {
      result = await freshAuthorizeRequest(mockRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(FreshUnauthorizedError);
      expect((err as any).message).toEqual("Unauthorized");
    }
    expect(result).toBeUndefined();
  });

  it("throws a ServerError when getSecretString fails", async () => {
    jest.resetModules();

    const { getSecretString: mockGetSecretString } = require("./clients/secretsClient");
    const { authorizeRequest: freshAuthorizeRequest } = require("./authorizeRequest");
    const { ServerError: FreshServerError } = require("./errors/serverError");

    mockGetSecretString.mockRejectedValue(new ServerError("Failed to fetch API access token from Secrets Manager"));

    let result;
    try {
      result = await freshAuthorizeRequest(mockRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(FreshServerError);
      expect((err as any).message).toEqual("Failed to fetch API access token from Secrets Manager");
    }
    expect(result).toBeUndefined();
  });
});
