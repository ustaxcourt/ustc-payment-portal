import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { lambdaHandler } from "./lambdaHandler";
import { ProcessPaymentRequestSchema } from "schemas/ProcessPayment.schema";
import { processPayment } from "useCases/processPayment";

export const processPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> =>
  lambdaHandler({
    schema: ProcessPaymentRequestSchema,
    event,
    rawRequest: event.body ?? "",
    callback: processPayment,
  });
