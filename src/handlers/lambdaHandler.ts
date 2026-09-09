import { APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { ZodType } from "zod";
import { createAppContext } from "../appContext";
import { extractCallerArn } from "../extractCallerArn";
import { handleError } from "../handleError";
import type { ClientPermission } from "@appTypes/ClientPermission";
import type { AppContext } from "@appTypes/AppContext";
import {
  getClientByRoleArn,
  getClientPermissions,
} from "@clients/permissionsClient";
import { parseAndValidate } from "@utils/parseAndValidate";
import { logger } from "@utils/logger";
import { getKnex } from "../db/knex";

// Pre-warm the RDS connection during the Lambda init phase so the first
// invocation does not pay Secrets Manager + TCP connection-setup latency. (Saves us some cold-start time.)
// In local/test environments RDS_SECRET_ARN is unset and getKnex() returns
// the already-initialised synchronous instance immediately.
void getKnex().catch((err) =>
  logger.error({ err }, "[lambdaHandler] getKnex prewarm failed"),
);
void getClientPermissions().catch((err) =>
  logger.error({ err }, "[lambdaHandler] getClientPermissions prewarm failed"),
);

type LambdaHandler<T> = (
  appContext: AppContext,
  params: { client: ClientPermission; request: T },
) => Promise<unknown>;

export const lambdaHandler = async <T>({
  schema,
  event,
  rawRequest,
  callback,
}: {
  schema: ZodType<T>;
  event: APIGatewayEvent;
  rawRequest: string;
  callback: LambdaHandler<T>;
}): Promise<APIGatewayProxyResult> => {
  const appContext = createAppContext({ lambdaRequest: event });
  try {
    const parsedRequest = parseAndValidate(rawRequest, schema);
    const roleArn = extractCallerArn(event.requestContext);
    const client = await getClientByRoleArn(roleArn);
    const result = await callback(appContext, {
      client,
      request: parsedRequest.value,
    });
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return handleError(appContext, err);
  }
};
