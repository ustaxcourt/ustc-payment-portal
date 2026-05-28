import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { lambdaHandler } from "./lambdaHandler";
import { GetDetailsPathParamsSchema } from "../schemas/GetDetails.schema";
import { getDetails } from "../useCases/getDetails";

export const getDetailsHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> =>
  lambdaHandler({
    schema: GetDetailsPathParamsSchema,
    event,
    rawRequest: JSON.stringify(event.pathParameters),
    callback: getDetails,
  });
