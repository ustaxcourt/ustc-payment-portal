import type { APIGatewayEvent } from "aws-lambda";
import {
  mockGetClientByRoleArn,
  mockHeaders,
  mockRequestContext,
  resetCommonHandlerMocks,
} from "./handlerTestCommon";
import { validateClientHandler } from "./validateClientHandler";
import { FeeConfigurationError } from "@errors/feeConfiguration";
import { ForbiddenError } from "@errors/forbidden";
import { ServerError } from "@errors/serverError";
import { ValidateClientResponseSchema } from "@schemas/ValidateClient.schema";
import {
  MISCONFIGURED_FEES_MESSAGE,
  validateClient,
} from "@useCases/validateClient";

jest.mock("../useCases/validateClient", () => ({
  ...jest.requireActual("../useCases/validateClient"),
  validateClient: jest.fn(),
}));

const mockValidateClient = validateClient as jest.MockedFunction<
  typeof validateClient
>;

const buildEvent = (
  requestContext: unknown = mockRequestContext,
): APIGatewayEvent =>
  ({
    // GET with no body and no path parameters — the caller is identified
    // entirely by the SigV4 signature.
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    headers: mockHeaders,
    requestContext,
  }) as unknown as APIGatewayEvent;

beforeEach(() => {
  resetCommonHandlerMocks();
  mockRequestContext.httpMethod = "GET";
  mockRequestContext.path = "/validate-client";
  mockRequestContext.resourcePath = "/validate-client";
  mockValidateClient.mockResolvedValue({
    clientName: "Test Client",
    allowedFeeKeys: ["PETITION_FILING_FEE"],
  });
});

describe("validateClientHandler", () => {
  it("returns 200 with a body matching ValidateClientResponseSchema", async () => {
    const result = await validateClientHandler(buildEvent());

    expect(result.statusCode).toBe(200);
    expect(() =>
      ValidateClientResponseSchema.parse(JSON.parse(result.body)),
    ).not.toThrow();
  });

  it("passes the resolved client through to the use case", async () => {
    await validateClientHandler(buildEvent());

    expect(mockValidateClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        client: expect.objectContaining({ clientName: "Test Client" }),
      }),
    );
  });

  // The three 403 layers below are the diagnostic the endpoint exists for: the
  // status is the same, but the message says which credential is wrong.
  it("returns 403 when the IAM principal is missing", async () => {
    const result = await validateClientHandler(
      buildEvent({ ...mockRequestContext, identity: { userArn: null } }),
    );

    expect(result.statusCode).toBe(403);
    expect(mockValidateClient).not.toHaveBeenCalled();
  });

  it("returns 403 when the IAM principal is not an assumed-role ARN", async () => {
    const result = await validateClientHandler(
      buildEvent({
        ...mockRequestContext,
        identity: { userArn: "not-an-arn" },
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(mockValidateClient).not.toHaveBeenCalled();
  });

  it("returns 403 'Client not registered' when the role ARN is unknown", async () => {
    mockGetClientByRoleArn.mockRejectedValueOnce(
      new ForbiddenError("Client not registered"),
    );

    const result = await validateClientHandler(buildEvent());

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe("Client not registered");
    expect(mockValidateClient).not.toHaveBeenCalled();
  });

  it("returns 403 with the misconfigured-fees message when the use case rejects", async () => {
    mockValidateClient.mockRejectedValueOnce(
      new ForbiddenError(MISCONFIGURED_FEES_MESSAGE),
    );

    const result = await validateClientHandler(buildEvent());

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe(MISCONFIGURED_FEES_MESSAGE);
  });

  it("returns 500 with the ServerError message when the permissions secret is unreadable", async () => {
    mockGetClientByRoleArn.mockRejectedValueOnce(
      new ServerError("Failed to fetch client permissions"),
    );

    const result = await validateClientHandler(buildEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe(
      "Failed to fetch client permissions",
    );
  });

  // `FeeConfigurationError` carries no `statusCode`, so `handleError` falls
  // through to the generic message rather than leaking our fee config.
  it("returns 500 with the generic message when the fee config is malformed", async () => {
    mockValidateClient.mockRejectedValueOnce(
      new FeeConfigurationError("PETITION_FILING_FEE", "tcsAppId is required"),
    );

    const result = await validateClientHandler(buildEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe(
      "An unexpected error occurred while processing the request",
    );
  });
});
