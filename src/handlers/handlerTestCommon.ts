import { getClientByRoleArn } from "clients/permissionsClient";

jest.mock("../appContext", () => ({
  createAppContext: jest.fn(
    () => require("../test/testAppContext").testAppContext,
  ),
}));

jest.mock("../clients/permissionsClient", () => ({
  getClientByRoleArn: jest.fn(),
  clearPermissionsCache: jest.fn(),
}));

export const mockGetClientByRoleArn = getClientByRoleArn as jest.MockedFunction<
  typeof getClientByRoleArn
>;

export const mockRequestContext = {
  identity: {
    userArn: "arn:aws:sts::123456789012:assumed-role/dawson-client/session-123",
  },
  accountId: "123456789012",
  apiId: "test-api",
  authorizer: {},
  httpMethod: "POST",
  path: "/test",
  protocol: "HTTP/1.1",
  requestId: "test-request-id",
  requestTimeEpoch: Date.now(),
  resourceId: "test-resource",
  resourcePath: "/test",
  stage: "test",
};

export const mockHeaders = {
  "Content-Type": "application/json",
};

export const resetCommonHandlerMocks = () => {
  jest.clearAllMocks();
  process.env.LOCAL_DEV = "false";
  mockGetClientByRoleArn.mockResolvedValue({
    clientName: "Test Client",
    clientRoleArn: "arn:aws:iam::123456789012:role/dawson-client",
    allowedFeeKeys: ["PETITION_FILING_FEE"],
  });
};
