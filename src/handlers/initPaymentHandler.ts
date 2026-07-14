import { InitPaymentRequestSchema } from "@schemas/InitPayment.schema";
import { initPayment } from "@useCases/initPayment";
import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { lambdaHandler } from "./lambdaHandler";

export const initPaymentHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> =>
  lambdaHandler({
    schema: InitPaymentRequestSchema,
    event,
    rawRequest: event.body ?? "",
    callback: initPayment,
  });
