import {
  extractCallerArn,
  convertAssumedRoleToIamArn,
} from "./extractCallerArn";
import { ForbiddenError } from "./errors/forbidden";
import { APIGatewayEventRequestContext } from "aws-lambda";

const createMockRequestContext = (
  userArn?: string | null
): APIGatewayEventRequestContext =>
  ({
    identity: {
      userArn,
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
  }) as APIGatewayEventRequestContext;

describe("extractCallerArn", () => {
  const validAssumedRoleArn =
    "arn:aws:sts::123456789012:assumed-role/dawson-client/session-abc123";
  const expectedIamRoleArn = "arn:aws:iam::123456789012:role/dawson-client";

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.LOCAL_DEV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("with valid IAM principal", () => {
    it("returns converted IAM role ARN", () => {
      const requestContext = createMockRequestContext(validAssumedRoleArn);

      const result = extractCallerArn(requestContext);

      expect(result).toBe(expectedIamRoleArn);
    });

    it("handles different account IDs and role names", () => {
      const requestContext = createMockRequestContext(
        "arn:aws:sts::999888777666:assumed-role/other-app-role/my-session"
      );

      const result = extractCallerArn(requestContext);

      expect(result).toBe("arn:aws:iam::999888777666:role/other-app-role");
    });
  });

  describe("with missing or invalid IAM principal", () => {
    it("throws ForbiddenError when requestContext is undefined", () => {
      expect(() => extractCallerArn(undefined)).toThrow(ForbiddenError);
      expect(() => extractCallerArn(undefined)).toThrow("Missing IAM principal");
    });

    it("throws ForbiddenError when identity is undefined", () => {
      const requestContext = {} as APIGatewayEventRequestContext;

      expect(() => extractCallerArn(requestContext)).toThrow(ForbiddenError);
      expect(() => extractCallerArn(requestContext)).toThrow(
        "Missing IAM principal"
      );
    });

    it("throws ForbiddenError when userArn is null", () => {
      const requestContext = createMockRequestContext(null);

      expect(() => extractCallerArn(requestContext)).toThrow(ForbiddenError);
    });

    it("throws ForbiddenError when userArn is invalid format", () => {
      const requestContext = createMockRequestContext("not-a-valid-arn");

      expect(() => extractCallerArn(requestContext)).toThrow(ForbiddenError);
      expect(() => extractCallerArn(requestContext)).toThrow(
        "Invalid IAM principal format"
      );
    });
  });

  describe("local development bypass", () => {
    it("returns mock IAM role ARN when LOCAL_DEV is true", () => {
      process.env.LOCAL_DEV = "true";

      const result = extractCallerArn(undefined);

      expect(result).toBe("arn:aws:iam::000000000000:role/local-dev-role");
    });

    it("does not bypass when LOCAL_DEV is false", () => {
      process.env.LOCAL_DEV = "false";

      expect(() => extractCallerArn(undefined)).toThrow(ForbiddenError);
    });
  });
});

describe("convertAssumedRoleToIamArn", () => {
  it("converts standard assumed-role ARN to IAM role ARN", () => {
    const assumedRoleArn =
      "arn:aws:sts::123456789012:assumed-role/my-role/session-name";

    const result = convertAssumedRoleToIamArn(assumedRoleArn);

    expect(result).toBe("arn:aws:iam::123456789012:role/my-role");
  });

  it("handles role names with hyphens and underscores", () => {
    const assumedRoleArn =
      "arn:aws:sts::111222333444:assumed-role/payment-portal_client-role/sess";

    const result = convertAssumedRoleToIamArn(assumedRoleArn);

    expect(result).toBe(
      "arn:aws:iam::111222333444:role/payment-portal_client-role"
    );
  });

  it("handles complex session names with slashes", () => {
    const assumedRoleArn =
      "arn:aws:sts::123456789012:assumed-role/role/session/with/slashes";

    const result = convertAssumedRoleToIamArn(assumedRoleArn);

    expect(result).toBe("arn:aws:iam::123456789012:role/role");
  });

  it("throws ForbiddenError for IAM user ARN (not assumed role)", () => {
    const iamUserArn = "arn:aws:iam::123456789012:user/admin";

    expect(() => convertAssumedRoleToIamArn(iamUserArn)).toThrow(ForbiddenError);
    expect(() => convertAssumedRoleToIamArn(iamUserArn)).toThrow(
      "Invalid IAM principal format"
    );
  });

  it("throws ForbiddenError for malformed ARN", () => {
    const malformedArn = "not-an-arn";

    expect(() => convertAssumedRoleToIamArn(malformedArn)).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError for IAM role ARN (already converted format)", () => {
    const iamRoleArn = "arn:aws:iam::123456789012:role/my-role";

    expect(() => convertAssumedRoleToIamArn(iamRoleArn)).toThrow(ForbiddenError);
  });
});
