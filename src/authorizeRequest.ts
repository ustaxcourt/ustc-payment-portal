import { ForbiddenError } from "./errors/forbidden";
import { APIGatewayEventRequestContext } from "aws-lambda";

/**
 * Mock IAM role ARN for local development when SigV4 is bypassed
 */
const LOCAL_DEV_ROLE_ARN = "arn:aws:iam::000000000000:role/local-dev-role";

/**
 * Converts an STS assumed-role ARN to an IAM role ARN for lookup.
 *
 * Input format:  arn:aws:sts::ACCOUNT_ID:assumed-role/role-name/session-name
 * Output format: arn:aws:iam::ACCOUNT_ID:role/role-name
 *
 * Note: Client IAM roles must be at root path (no custom path prefix).
 * STS assumed-role ARNs drop path prefixes, breaking ARN reconstruction.
 */
export const convertAssumedRoleToIamArn = (assumedRoleArn: string): string => {
  const match = assumedRoleArn.match(
    /^arn:aws:sts::(\d+):assumed-role\/([^/]+)\/.+$/
  );

  if (!match) {
    throw new ForbiddenError("Invalid IAM principal format");
  }

  const [, accountId, roleName] = match;
  return `arn:aws:iam::${accountId}:role/${roleName}`;
};

/**
 * Extracts and validates the IAM principal from API Gateway request context.
 *
 * In deployed environments, API Gateway validates SigV4 signatures before
 * invoking Lambda. This function extracts the IAM identity for app-level
 * authorization (client lookup, tcsAppId validation).
 *
 * In local development (LOCAL_DEV=true), returns a mock IAM role ARN.
 *
 * @param requestContext - The requestContext from APIGatewayProxyEvent
 * @returns The IAM role ARN for client lookup
 * @throws ForbiddenError if IAM principal is missing or invalid
 */
export const authorizeRequest = (
  requestContext?: APIGatewayEventRequestContext
): string => {
  // Bypass for local development
  if (process.env.LOCAL_DEV === "true") {
    console.log("Local development mode: bypassing IAM authorization");
    return LOCAL_DEV_ROLE_ARN;
  }

  const userArn = requestContext?.identity?.userArn;

  if (!userArn) {
    throw new ForbiddenError("Missing IAM principal");
  }

  return convertAssumedRoleToIamArn(userArn);
};
