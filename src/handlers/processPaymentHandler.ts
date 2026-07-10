import { ProcessPaymentRequestSchema } from "@schemas/ProcessPayment.schema";
import { processPayment } from "@useCases/processPayment";
import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { lambdaHandler } from "./lambdaHandler";

export const processPaymentHandler = (
	event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> =>
	lambdaHandler({
		schema: ProcessPaymentRequestSchema,
		event,
		rawRequest: event.body ?? "",
		callback: processPayment,
	});
